import * as path from 'path';
import * as fs from 'fs';
import fg from 'fast-glob';
import { initParser, getLanguage, parseSource, getSupportedExtensions } from './treeSitter.js';
import { getExtractor } from './extractors/index.js';
import { extractFast } from './extractors/regexFast.js';
import { resolveImportPath, loadPathAliases, type PathAliases } from './resolver.js';
import type { FileParseResult } from './types.js';
import { loadDiskCache, saveDiskCache, isCacheEntryValid } from '../extension/diskCache.js';

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.nuxt/**',
];

/**
 * Parse a single file and resolve its imports against the project file set.
 */
export async function scanSingleFile(
  filePath: string,
  projectFileSet: Set<string>,
  pathAliases?: PathAliases | null,
): Promise<FileParseResult> {
  await initParser();

  const normalized = filePath.replace(/\\/g, '/');
  const ext = path.extname(normalized);
  const content = fs.readFileSync(normalized, 'utf-8');

  const language = await getLanguage(ext);
  const tree = parseSource(content, language);
  const extractor = getExtractor(ext);
  const { imports, exports } = extractor(tree);

  for (const imp of imports) {
    imp.resolvedPath = resolveImportPath(imp.source, normalized, projectFileSet, pathAliases) ?? undefined;
  }

  for (const exp of exports) {
    if (exp.source) {
      const resolvedPath = resolveImportPath(exp.source, normalized, projectFileSet, pathAliases) ?? undefined;
      imports.push({
        source: exp.source,
        resolvedPath,
        specifiers: [],
        kind: 'static',
        line: exp.line,
        isTypeOnly: exp.isTypeOnly,
      });
    }
  }

  tree.delete();

  return { filePath: normalized, imports, exports };
}

export async function scanProject(rootDir: string, grammarDir?: string): Promise<FileParseResult[]> {
  const absRoot = path.resolve(rootDir).replace(/\\/g, '/');

  // Discover files
  const extensions = getSupportedExtensions().map(e => e.slice(1)); // remove leading dot
  const pattern = `**/*.{${extensions.join(',')}}`;
  const files = await fg(pattern, {
    cwd: absRoot,
    ignore: DEFAULT_IGNORE,
    absolute: true,
  });

  // Normalize all paths to forward slashes
  const normalizedFiles = files.map(f => f.replace(/\\/g, '/'));
  const projectFileSet = new Set(normalizedFiles);

  // Initialize parser
  if (grammarDir) {
    const { setGrammarDir } = await import('./treeSitter.js');
    setGrammarDir(grammarDir);
  }
  await initParser();

  // Load path aliases from tsconfig.json
  const pathAliases = loadPathAliases(absRoot);

  // Pre-load all file contents in parallel (I/O bound)
  const fileContents = await Promise.all(
    normalizedFiles.map(async (filePath) => ({
      filePath,
      content: await fs.promises.readFile(filePath, 'utf-8'),
      ext: path.extname(filePath),
    })),
  );

  // Fast regex extraction for JS/TS files, Tree-sitter for Python/Go
  const JS_TS_EXTS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
  const results: FileParseResult[] = [];

  for (const { filePath, content, ext } of fileContents) {
    let imports, exports;

    if (JS_TS_EXTS.has(ext)) {
      // Regex fast-path: ~100x faster than Tree-sitter WASM
      ({ imports, exports } = extractFast(content));
    } else {
      // Tree-sitter for Python/Go
      const language = await getLanguage(ext);
      const tree = parseSource(content, language);
      const extractor = getExtractor(ext);
      ({ imports, exports } = extractor(tree));
      tree.delete();
    }

    // Resolve import paths
    for (const imp of imports) {
      imp.resolvedPath = resolveImportPath(imp.source, filePath, projectFileSet, pathAliases) ?? undefined;
    }

    results.push({ filePath, imports, exports });
  }

  return results;
}

/**
 * Scan project using disk cache: only re-parse files that have changed since last scan.
 */
export async function scanProjectWithCache(rootDir: string, grammarDir?: string): Promise<FileParseResult[]> {
  const absRoot = path.resolve(rootDir).replace(/\\/g, '/');
  const cache = loadDiskCache(absRoot);

  // Discover current files
  const extensions = getSupportedExtensions().map(e => e.slice(1));
  const pattern = `**/*.{${extensions.join(',')}}`;
  const files = await fg(pattern, {
    cwd: absRoot,
    ignore: DEFAULT_IGNORE,
    absolute: true,
  });

  const normalizedFiles = files.map(f => f.replace(/\\/g, '/'));
  const projectFileSet = new Set(normalizedFiles);

  // Initialize parser
  if (grammarDir) {
    const { setGrammarDir } = await import('./treeSitter.js');
    setGrammarDir(grammarDir);
  }
  await initParser();

  const pathAliases = loadPathAliases(absRoot);

  // Separate cached (valid) from uncached (need parsing)
  const cachedResults: FileParseResult[] = [];
  const filesToParse: string[] = [];

  for (const filePath of normalizedFiles) {
    const entry = cache.get(filePath);
    if (entry && isCacheEntryValid(entry)) {
      cachedResults.push(entry.result);
    } else {
      filesToParse.push(filePath);
    }
  }

  // Parse only changed files
  if (filesToParse.length > 0) {
    const fileContents = await Promise.all(
      filesToParse.map(async (filePath) => ({
        filePath,
        content: await fs.promises.readFile(filePath, 'utf-8'),
        ext: path.extname(filePath),
      })),
    );

    const JS_TS_EXTS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);

    for (const { filePath, content, ext } of fileContents) {
      let imports, exports;

      if (JS_TS_EXTS.has(ext)) {
        ({ imports, exports } = extractFast(content));
      } else {
        const language = await getLanguage(ext);
        const tree = parseSource(content, language);
        const extractor = getExtractor(ext);
        ({ imports, exports } = extractor(tree));
        tree.delete();
      }

      for (const imp of imports) {
        imp.resolvedPath = resolveImportPath(imp.source, filePath, projectFileSet, pathAliases) ?? undefined;
      }

      cachedResults.push({ filePath, imports, exports });
    }
  }

  // Save updated cache to disk
  saveDiskCache(absRoot, cachedResults);

  return cachedResults;
}
