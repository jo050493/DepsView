import type { Tree } from 'web-tree-sitter';
import type { ImportInfo, ExportInfo } from '../types.js';
import { extractImportsExports } from './shared.js';

export function extractJavaScript(tree: Tree): { imports: ImportInfo[]; exports: ExportInfo[] } {
  return extractImportsExports(tree, { trackTypeOnly: false });
}
