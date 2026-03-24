import * as path from 'path';
import * as fs from 'fs';
import { Parser, Language, type Tree } from 'web-tree-sitter';

let initialized = false;
const languageCache = new Map<string, Language>();

const EXT_TO_GRAMMAR: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.py': 'python',
  '.go': 'go',
};

let grammarDirOverride: string | undefined;

export function setGrammarDir(dir: string): void {
  grammarDirOverride = dir;
}

function getGrammarDir(): string {
  if (grammarDirOverride) return grammarDirOverride;
  return path.join(__dirname, 'grammars');
}

export async function initParser(): Promise<void> {
  if (initialized) return;

  const treeSitterWasm = path.join(getGrammarDir(), 'tree-sitter.wasm');
  if (fs.existsSync(treeSitterWasm)) {
    await Parser.init({
      locateFile: () => treeSitterWasm,
    });
  } else {
    await Parser.init();
  }
  initialized = true;
}

export async function getLanguage(ext: string): Promise<Language> {
  const grammarName = EXT_TO_GRAMMAR[ext];
  if (!grammarName) {
    throw new Error(`Unsupported file extension: ${ext}`);
  }

  const cached = languageCache.get(grammarName);
  if (cached) return cached;

  const wasmPath = path.join(getGrammarDir(), `tree-sitter-${grammarName}.wasm`);
  const wasmBytes = fs.readFileSync(wasmPath);
  const language = await Language.load(wasmBytes);
  languageCache.set(grammarName, language);
  return language;
}

export function parseSource(source: string, language: Language): Tree {
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source);
  if (!tree) throw new Error('Failed to parse source');
  parser.delete();
  return tree;
}

export function getSupportedExtensions(): string[] {
  return Object.keys(EXT_TO_GRAMMAR);
}

export type { Tree, Language };
