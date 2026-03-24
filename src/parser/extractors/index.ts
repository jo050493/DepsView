import type { Tree } from 'web-tree-sitter';
import type { ImportInfo, ExportInfo } from '../types.js';
import { extractJavaScript } from './javascript.js';
import { extractTypeScript } from './typescript.js';
import { extractPython } from './python.js';
import { extractGo } from './go.js';

export type Extractor = (tree: Tree) => { imports: ImportInfo[]; exports: ExportInfo[] };

const extractorMap: Record<string, Extractor> = {
  '.js': extractJavaScript,
  '.jsx': extractJavaScript,
  '.mjs': extractJavaScript,
  '.cjs': extractJavaScript,
  '.ts': extractTypeScript,
  '.tsx': extractTypeScript,
  '.mts': extractTypeScript,
  '.cts': extractTypeScript,
  '.py': extractPython,
  '.go': extractGo,
};

export function getExtractor(ext: string): Extractor {
  const extractor = extractorMap[ext];
  if (!extractor) {
    throw new Error(`No extractor for extension: ${ext}`);
  }
  return extractor;
}
