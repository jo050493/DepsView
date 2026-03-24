/**
 * Fast regex-based import/export extraction for JS/TS files.
 * Handles ~95% of real-world imports without Tree-sitter overhead.
 * Falls back to Tree-sitter for files with dynamic imports or complex patterns.
 */
import type { ImportInfo, ExportInfo } from '../types.js';

// Match: import ... from '...' | import '...'
// Captures: group 1 = clause (default, {named}, * as ns), group 2 = source
const IMPORT_RE = /^\s*import\s+(?:type\s+)?((?:{[^}]*}|\*\s+as\s+\w+|[\w$]+(?:\s*,\s*{[^}]*})?))\s+from\s+['"]([^'"]+)['"]|^\s*import\s+(?:type\s+)?['"]([^'"]+)['"]/gm;

// Match: export ... from '...'
const REEXPORT_RE = /^\s*export\s+(?:type\s+)?(?:{[^}]*}|\*(?:\s+as\s+\w+)?)\s+from\s+['"]([^'"]+)['"]/gm;

// Match: require('...')
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

// Match: import('...')
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

// Match: export const/function/class/interface/type/enum
const EXPORT_RE = /^\s*export\s+(?:default\s+)?(?:const|let|var|function\*?|class|interface|type|enum|abstract)\s+(\w+)/gm;
const EXPORT_DEFAULT_RE = /^\s*export\s+default\b/gm;
// Match: export { a, b, c } (without from — local re-exports)
const EXPORT_LIST_RE = /^\s*export\s+(?:type\s+)?{([^}]+)}\s*;?\s*$/gm;

/**
 * Returns true if the file can be fully handled by regex (no complex patterns).
 * Files with dynamic imports need Tree-sitter for accurate line numbers.
 */
export function canUseFastPath(content: string): boolean {
  // If file has dynamic import() expressions, fall back to Tree-sitter
  // (but only if they use variable expressions, not string literals)
  return !content.includes('import(') || DYNAMIC_IMPORT_RE.test(content);
}

export function extractFast(content: string): { imports: ImportInfo[]; exports: ExportInfo[] } {
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];

  // Static imports
  IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    const isTypeOnly = match[0].includes('import type');
    const source = match[2] ?? match[3]; // group 2 = with clause, group 3 = side-effect
    const clause = match[1] ?? '';
    const specifiers = parseSpecifiers(clause);
    imports.push({
      source,
      specifiers,
      kind: 'static',
      line,
      isTypeOnly,
    });
  }

  // Re-exports (export * from '...', export { x } from '...')
  REEXPORT_RE.lastIndex = 0;
  while ((match = REEXPORT_RE.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    const isTypeOnly = match[0].includes('export type');
    imports.push({
      source: match[1],
      specifiers: [],
      kind: 'static',
      line,
      isTypeOnly,
    });
    exports.push({
      specifiers: [],
      source: match[1],
      kind: 'all',
      line,
      isTypeOnly,
    });
  }

  // require()
  REQUIRE_RE.lastIndex = 0;
  while ((match = REQUIRE_RE.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    imports.push({
      source: match[1],
      specifiers: [],
      kind: 'require',
      line,
      isTypeOnly: false,
    });
  }

  // Dynamic import()
  DYNAMIC_IMPORT_RE.lastIndex = 0;
  while ((match = DYNAMIC_IMPORT_RE.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    imports.push({
      source: match[1],
      specifiers: [],
      kind: 'dynamic',
      line,
      isTypeOnly: false,
    });
  }

  // Named exports (export const/function/class ...)
  EXPORT_RE.lastIndex = 0;
  while ((match = EXPORT_RE.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    exports.push({
      specifiers: [{ name: match[1] }],
      kind: 'named',
      line,
      isTypeOnly: match[0].includes('export type') || match[0].includes('export interface'),
    });
  }

  // Default exports
  EXPORT_DEFAULT_RE.lastIndex = 0;
  while ((match = EXPORT_DEFAULT_RE.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    exports.push({
      specifiers: [{ name: 'default' }],
      kind: 'default',
      line,
      isTypeOnly: false,
    });
  }

  // Local export list: export { a, b, c }
  EXPORT_LIST_RE.lastIndex = 0;
  while ((match = EXPORT_LIST_RE.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    const isTypeOnly = match[0].includes('export type');
    const inner = match[1].trim();
    for (const part of inner.split(',')) {
      const trimmed = part.replace(/\btype\s+/, '').trim();
      if (!trimmed) continue;
      const aliasMatch = trimmed.match(/^(\w+)\s+as\s+(\w+)$/);
      const name = aliasMatch ? aliasMatch[1] : trimmed;
      exports.push({
        specifiers: [{ name, alias: aliasMatch?.[2] }],
        kind: 'named',
        line,
        isTypeOnly,
      });
    }
  }

  return { imports, exports };
}

function parseSpecifiers(clause: string): import('../types.js').ImportSpecifier[] {
  if (!clause) return [];
  const specs: import('../types.js').ImportSpecifier[] = [];

  // Namespace: * as name
  if (clause.startsWith('*')) {
    const nsMatch = clause.match(/\*\s+as\s+(\w+)/);
    if (nsMatch) specs.push({ name: nsMatch[1], isDefault: false, isNamespace: true });
    return specs;
  }

  // Default + named: DefaultName, { a, b as c }
  const parts = clause.match(/^([\w$]+)(?:\s*,\s*({[^}]*}))?$/) ?? clause.match(/^({[^}]*})$/);
  if (!parts) return [];

  // Default import
  if (parts[1] && !parts[1].startsWith('{')) {
    specs.push({ name: parts[1], isDefault: true, isNamespace: false });
  }

  // Named imports: { a, b as c, type d }
  const namedBlock = parts[2] ?? (parts[1]?.startsWith('{') ? parts[1] : null);
  if (namedBlock) {
    const inner = namedBlock.replace(/[{}]/g, '').trim();
    for (const part of inner.split(',')) {
      const trimmed = part.replace(/\btype\s+/, '').trim();
      if (!trimmed) continue;
      const aliasMatch = trimmed.match(/^(\w+)\s+as\s+(\w+)$/);
      if (aliasMatch) {
        specs.push({ name: aliasMatch[1], alias: aliasMatch[2], isDefault: false, isNamespace: false });
      } else {
        specs.push({ name: trimmed, isDefault: false, isNamespace: false });
      }
    }
  }

  return specs;
}
