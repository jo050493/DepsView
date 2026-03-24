import type { Tree } from 'web-tree-sitter';
import type { ImportInfo, ExportInfo } from '../types.js';
import { extractImportsExports } from './shared.js';

export function extractTypeScript(tree: Tree): { imports: ImportInfo[]; exports: ExportInfo[] } {
  return extractImportsExports(tree, { trackTypeOnly: true });
}
