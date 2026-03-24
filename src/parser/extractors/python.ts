import type { Tree, SyntaxNode } from 'web-tree-sitter';
import type { ImportInfo, ExportInfo } from '../types.js';

/**
 * Extract imports and exports from a Python AST.
 *
 * Python imports:
 *   import foo            → absolute import
 *   import foo.bar        → absolute import
 *   from foo import bar   → absolute import with specifiers
 *   from . import bar     → relative import
 *   from ..foo import bar → relative import
 *
 * Python exports:
 *   All top-level function/class definitions are considered exports.
 *   __all__ = [...] is not parsed (too complex for static analysis).
 */
export function extractPython(tree: Tree): { imports: ImportInfo[]; exports: ExportInfo[] } {
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  const root = tree.rootNode;

  function walk(node: SyntaxNode): void {
    if (node.type === 'import_statement') {
      // import foo / import foo.bar / import foo as bar
      const nameNode = node.namedChild(0);
      if (nameNode) {
        const moduleName = nameNode.type === 'aliased_import'
          ? nameNode.namedChild(0)?.text ?? ''
          : nameNode.text;

        if (moduleName) {
          imports.push({
            source: moduleName.replace(/\./g, '/'),
            specifiers: [],
            kind: 'static',
            line: node.startPosition.row + 1,
            isTypeOnly: false,
          });
        }
      }
    } else if (node.type === 'import_from_statement') {
      // from X import Y, Z
      const moduleNode = node.childForFieldName('module_name');
      let source = '';
      let dotsPrefix = '';

      // Collect leading dots for relative imports
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child && child.type === 'relative_import') {
          // Handle 'from . import X' or 'from ..foo import X'
          for (let j = 0; j < child.childCount; j++) {
            const dot = child.child(j);
            if (dot && dot.type === 'import_prefix') {
              dotsPrefix = dot.text; // e.g. '.', '..', '...'
            } else if (dot && dot.type === 'dotted_name') {
              source = dot.text;
            }
          }
          break;
        }
      }

      // If no relative import child, try to find module via children
      if (!dotsPrefix) {
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child && child.type === 'dotted_name' && i < node.childCount - 1) {
            source = child.text;
            break;
          }
        }
      }

      // Build the import source
      let importSource = '';
      if (dotsPrefix) {
        // Relative import: convert dots to ../ prefix
        const levels = dotsPrefix.length;
        const prefix = levels === 1 ? './' : '../'.repeat(levels - 1);
        importSource = prefix + (source ? source.replace(/\./g, '/') : '');
      } else if (source) {
        importSource = source.replace(/\./g, '/');
      }

      if (!importSource) {
        // Fallback: try text parsing
        const text = node.text;
        const match = text.match(/from\s+(\.{1,3}[\w.]*|[\w.]+)\s+import/);
        if (match) {
          const raw = match[1];
          if (raw.startsWith('.')) {
            const dots = raw.match(/^\.+/)?.[0] ?? '.';
            const rest = raw.slice(dots.length);
            const levels = dots.length;
            const prefix = levels === 1 ? './' : '../'.repeat(levels - 1);
            importSource = prefix + rest.replace(/\./g, '/');
          } else {
            importSource = raw.replace(/\./g, '/');
          }
        }
      }

      if (!importSource) return;

      // Collect specifiers
      const specifiers = [];
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (!child) continue;
        if (child.type === 'dotted_name' && i > 0) {
          specifiers.push({
            name: child.text,
            isDefault: false,
            isNamespace: false,
          });
        } else if (child.type === 'aliased_import') {
          const name = child.namedChild(0)?.text ?? '';
          const alias = child.namedChild(1)?.text;
          if (name) {
            specifiers.push({
              name,
              alias,
              isDefault: false,
              isNamespace: false,
            });
          }
        } else if (child.type === 'wildcard_import') {
          specifiers.push({
            name: '*',
            isDefault: false,
            isNamespace: true,
          });
        }
      }

      imports.push({
        source: importSource,
        specifiers,
        kind: 'static',
        line: node.startPosition.row + 1,
        isTypeOnly: false,
      });
    }

    // Exports: top-level function/class definitions
    if (node.parent === root) {
      if (node.type === 'function_definition' || node.type === 'class_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          exports.push({
            specifiers: [{ name: nameNode.text }],
            kind: 'named',
            line: node.startPosition.row + 1,
            isTypeOnly: false,
          });
        }
      } else if (node.type === 'decorated_definition') {
        // @decorator\ndef foo(): ...
        const def = node.namedChild(node.namedChildCount - 1);
        if (def && (def.type === 'function_definition' || def.type === 'class_definition')) {
          const nameNode = def.childForFieldName('name');
          if (nameNode) {
            exports.push({
              specifiers: [{ name: nameNode.text }],
              kind: 'named',
              line: def.startPosition.row + 1,
              isTypeOnly: false,
            });
          }
        }
      }
    }

    // Walk children
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) walk(child);
    }
  }

  walk(root);
  return { imports, exports };
}
