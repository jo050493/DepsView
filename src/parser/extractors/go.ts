import type { Tree, SyntaxNode } from 'web-tree-sitter';
import type { ImportInfo, ExportInfo } from '../types.js';

/**
 * Extract imports and exports from a Go AST.
 *
 * Go imports:
 *   import "fmt"                    → stdlib (skipped — bare specifier)
 *   import "github.com/foo/bar"    → module import (bare specifier, skipped)
 *   import "./internal/utils"      → relative import (rare in Go, but supported)
 *   import ( "fmt" ; "os" )        → grouped import
 *
 * Go exports:
 *   All capitalized top-level identifiers (functions, types, vars, consts) are exported.
 */
export function extractGo(tree: Tree): { imports: ImportInfo[]; exports: ExportInfo[] } {
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  const root = tree.rootNode;

  function processImportSpec(node: SyntaxNode): void {
    // import_spec: optional alias + path (string literal)
    const pathNode = node.namedChildCount > 0
      ? node.namedChild(node.namedChildCount - 1)
      : null;

    if (!pathNode) return;

    // Extract the import path (strip quotes)
    let importPath = pathNode.text.replace(/^"|"$/g, '');

    // Skip standard library and external modules (no dots or slash prefix)
    // Only process relative imports (starting with . or ..)
    if (!importPath.startsWith('.')) return;

    const alias = node.namedChildCount > 1
      ? node.namedChild(0)?.text
      : undefined;

    imports.push({
      source: importPath,
      specifiers: alias ? [{
        name: alias,
        isDefault: false,
        isNamespace: alias === '.',
      }] : [],
      kind: 'static',
      line: node.startPosition.row + 1,
      isTypeOnly: false,
    });
  }

  function walk(node: SyntaxNode): void {
    if (node.type === 'import_declaration') {
      // Can contain import_spec_list or a single import_spec
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (!child) continue;
        if (child.type === 'import_spec_list') {
          for (let j = 0; j < child.namedChildCount; j++) {
            const spec = child.namedChild(j);
            if (spec && spec.type === 'import_spec') {
              processImportSpec(spec);
            }
          }
        } else if (child.type === 'import_spec') {
          processImportSpec(child);
        } else if (child.type === 'interpreted_string_literal') {
          // Single import without spec wrapper
          const importPath = child.text.replace(/^"|"$/g, '');
          if (importPath.startsWith('.')) {
            imports.push({
              source: importPath,
              specifiers: [],
              kind: 'static',
              line: node.startPosition.row + 1,
              isTypeOnly: false,
            });
          }
        }
      }
    }

    // Exports: top-level declarations with capitalized names
    if (node.parent === root) {
      const exportNames = extractExportedNames(node);
      for (const name of exportNames) {
        exports.push({
          specifiers: [{ name }],
          kind: 'named',
          line: node.startPosition.row + 1,
          isTypeOnly: false,
        });
      }
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) walk(child);
    }
  }

  function extractExportedNames(node: SyntaxNode): string[] {
    const names: string[] = [];

    if (node.type === 'function_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode && isCapitalized(nameNode.text)) {
        names.push(nameNode.text);
      }
    } else if (node.type === 'method_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode && isCapitalized(nameNode.text)) {
        names.push(nameNode.text);
      }
    } else if (node.type === 'type_declaration') {
      for (let i = 0; i < node.namedChildCount; i++) {
        const spec = node.namedChild(i);
        if (spec && spec.type === 'type_spec') {
          const nameNode = spec.childForFieldName('name');
          if (nameNode && isCapitalized(nameNode.text)) {
            names.push(nameNode.text);
          }
        }
      }
    } else if (node.type === 'var_declaration' || node.type === 'const_declaration') {
      for (let i = 0; i < node.namedChildCount; i++) {
        const spec = node.namedChild(i);
        if (!spec) continue;
        if (spec.type === 'var_spec' || spec.type === 'const_spec') {
          const nameNode = spec.childForFieldName('name');
          if (nameNode && isCapitalized(nameNode.text)) {
            names.push(nameNode.text);
          }
        }
      }
    }

    return names;
  }

  function isCapitalized(name: string): boolean {
    return name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
  }

  walk(root);
  return { imports, exports };
}
