import type { Node, Tree } from 'web-tree-sitter';
import type {
  ImportInfo,
  ImportSpecifier,
  ExportInfo,
  ExportSpecifier,
} from '../types.js';

function stripQuotes(text: string): string {
  return text.replace(/^['"`]|['"`]$/g, '');
}

function lineOf(node: Node): number {
  return node.startPosition.row + 1;
}

function extractImportSpecifiers(importClause: Node): ImportSpecifier[] {
  const specifiers: ImportSpecifier[] = [];

  for (const child of importClause.children) {
    if (child.type === 'identifier') {
      specifiers.push({ name: child.text, isDefault: true, isNamespace: false });
    } else if (child.type === 'namespace_import') {
      const nameNode = child.childForFieldName('name') ?? child.namedChildren[0];
      if (nameNode) {
        specifiers.push({ name: nameNode.text, isDefault: false, isNamespace: true });
      }
    } else if (child.type === 'named_imports') {
      for (const spec of child.namedChildren) {
        if (spec.type === 'import_specifier') {
          const nameNode = spec.childForFieldName('name');
          const aliasNode = spec.childForFieldName('alias');
          if (nameNode) {
            specifiers.push({
              name: nameNode.text,
              alias: aliasNode ? aliasNode.text : undefined,
              isDefault: false,
              isNamespace: false,
            });
          }
        }
      }
    }
  }

  return specifiers;
}

function extractStaticImport(node: Node, trackTypeOnly: boolean): ImportInfo | null {
  const sourceNode = node.childForFieldName('source');
  if (!sourceNode) return null;

  const source = stripQuotes(sourceNode.text);
  const specifiers: ImportSpecifier[] = [];
  let isTypeOnly = false;

  if (trackTypeOnly && node.text.startsWith('import type ')) {
    isTypeOnly = true;
  }

  for (const child of node.children) {
    if (child.type === 'import_clause') {
      specifiers.push(...extractImportSpecifiers(child));
    }
  }

  return {
    source,
    specifiers,
    kind: 'static',
    line: lineOf(node),
    isTypeOnly,
  };
}

function findDynamicImports(node: Node, results: ImportInfo[]): void {
  if (node.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    const args = node.childForFieldName('arguments');

    if (fn && fn.type === 'import') {
      const firstArg = args?.namedChildren[0];
      if (firstArg && (firstArg.type === 'string' || firstArg.type === 'template_string')) {
        results.push({
          source: stripQuotes(firstArg.text),
          specifiers: [],
          kind: 'dynamic',
          line: lineOf(node),
          isTypeOnly: false,
        });
      }
    } else if (fn && fn.type === 'identifier' && fn.text === 'require') {
      const firstArg = args?.namedChildren[0];
      if (firstArg && (firstArg.type === 'string' || firstArg.type === 'template_string')) {
        results.push({
          source: stripQuotes(firstArg.text),
          specifiers: [],
          kind: 'require',
          line: lineOf(node),
          isTypeOnly: false,
        });
      }
    }
  }

  for (const child of node.children) {
    findDynamicImports(child, results);
  }
}

function extractExportFromStatement(node: Node, trackTypeOnly: boolean): ExportInfo | null {
  let isTypeOnly = false;
  if (trackTypeOnly && node.text.startsWith('export type ')) {
    isTypeOnly = true;
  }

  const sourceNode = node.childForFieldName('source');
  const source = sourceNode ? stripQuotes(sourceNode.text) : undefined;

  // export * from './Y' (barrel)
  for (const child of node.children) {
    if (child.type === 'namespace_export' || (child.type === '*' || child.text === '*')) {
      if (source) {
        return {
          specifiers: [],
          source,
          kind: 'all',
          line: lineOf(node),
          isTypeOnly,
        };
      }
    }
  }

  // export { X, Y as Z } or export { X } from './Y'
  for (const child of node.children) {
    if (child.type === 'export_clause') {
      const specifiers: ExportSpecifier[] = [];
      for (const spec of child.namedChildren) {
        if (spec.type === 'export_specifier') {
          const nameNode = spec.childForFieldName('name');
          const aliasNode = spec.childForFieldName('alias');
          if (nameNode) {
            specifiers.push({
              name: nameNode.text,
              alias: aliasNode ? aliasNode.text : undefined,
            });
          }
        }
      }
      return {
        specifiers,
        source,
        kind: 'named',
        line: lineOf(node),
        isTypeOnly,
      };
    }
  }

  // export default ...
  if (node.text.match(/^export\s+default\s/)) {
    return {
      specifiers: [{ name: 'default' }],
      kind: 'default',
      line: lineOf(node),
      isTypeOnly: false,
    };
  }

  // export function foo() / export class Bar
  const declaration = node.childForFieldName('declaration');
  if (declaration) {
    // For lexical_declaration (const/let/var), extract all variable declarator names
    if (declaration.type === 'lexical_declaration' || declaration.type === 'variable_declaration') {
      const specifiers: ExportSpecifier[] = [];
      for (const child of declaration.children) {
        if (child.type === 'variable_declarator') {
          const nameNode = child.childForFieldName('name');
          if (!nameNode) continue;

          if (nameNode.type === 'object_pattern') {
            // Destructured export: export const { A, B, C } = ...
            for (const prop of nameNode.namedChildren) {
              if (prop.type === 'shorthand_property_identifier_pattern') {
                specifiers.push({ name: prop.text });
              } else if (prop.type === 'pair_pattern') {
                const value = prop.childForFieldName('value');
                if (value) specifiers.push({ name: value.text });
              }
            }
          } else if (nameNode.type === 'array_pattern') {
            // Destructured array: export const [A, B] = ...
            for (const el of nameNode.namedChildren) {
              if (el.type === 'identifier') specifiers.push({ name: el.text });
            }
          } else {
            specifiers.push({ name: nameNode.text });
          }
        }
      }
      if (specifiers.length > 0) {
        return {
          specifiers,
          kind: 'declaration',
          line: lineOf(node),
          isTypeOnly,
        };
      }
    }

    // function_declaration, class_declaration, type_alias_declaration, etc.
    const nameNode = declaration.childForFieldName('name');
    const name = nameNode?.text ?? 'anonymous';
    return {
      specifiers: [{ name }],
      kind: 'declaration',
      line: lineOf(node),
      isTypeOnly,
    };
  }

  return null;
}

export interface ExtractOptions {
  trackTypeOnly: boolean;
}

export function extractImportsExports(
  tree: Tree,
  options: ExtractOptions = { trackTypeOnly: false },
): { imports: ImportInfo[]; exports: ExportInfo[] } {
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  const root = tree.rootNode;

  for (const child of root.children) {
    if (child.type === 'import_statement') {
      const imp = extractStaticImport(child, options.trackTypeOnly);
      if (imp) imports.push(imp);
    }

    if (child.type === 'export_statement') {
      const exp = extractExportFromStatement(child, options.trackTypeOnly);
      if (exp) exports.push(exp);
    }
  }

  // Dynamic imports and require() — search the entire tree
  findDynamicImports(root, imports);

  return { imports, exports };
}
