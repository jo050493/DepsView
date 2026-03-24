import * as path from 'path';
import * as fs from 'fs';

const EXTENSIONS_TO_PROBE = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs', '.py', '.go'];
const INDEX_FILES = [
  ...(['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'] as const).map(ext => `index${ext}`),
  '__init__.py',
];

export type PathAliases = Map<string, string[]>;

// ESM convention: .js → .ts, .jsx → .tsx, .mjs → .mts, .cjs → .cts
const ESM_EXTENSION_MAP: Record<string, string> = {
  '.js': '.ts',
  '.jsx': '.tsx',
  '.mjs': '.mts',
  '.cjs': '.cts',
};

const TSCONFIG_FILES = ['tsconfig.json', 'tsconfig.app.json', 'jsconfig.json'];

/**
 * Load path aliases from tsconfig.json / jsconfig.json.
 * Returns a Map of alias prefix → resolved directory paths.
 */
export function loadPathAliases(rootDir: string): PathAliases | null {
  const normalized = rootDir.replace(/\\/g, '/');

  for (const configName of TSCONFIG_FILES) {
    const configPath = path.join(rootDir, configName);
    if (!fs.existsSync(configPath)) continue;

    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      // Strip single-line comments (// but not inside strings) and block comments
      const stripped = raw
        .replace(/("(?:[^"\\]|\\.)*")|\/\/.*$/gm, '$1')
        .replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\//g, '$1');
      const config = JSON.parse(stripped);

      const paths = config?.compilerOptions?.paths;
      if (!paths || typeof paths !== 'object') {
        // Try "extends" to find paths in parent tsconfig
        if (config?.extends) {
          const parentPath = path.resolve(rootDir, config.extends);
          if (fs.existsSync(parentPath)) {
            const parentRaw = fs.readFileSync(parentPath, 'utf-8');
            const parentStripped = parentRaw
              .replace(/("(?:[^"\\]|\\.)*")|\/\/.*$/gm, '$1')
              .replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\//g, '$1');
            const parentConfig = JSON.parse(parentStripped);
            const parentPaths = parentConfig?.compilerOptions?.paths;
            if (parentPaths && typeof parentPaths === 'object') {
              const baseUrl = (parentConfig.compilerOptions?.baseUrl ?? config.compilerOptions?.baseUrl ?? '.').replace(/\\/g, '/');
              const baseDir = path.resolve(rootDir, baseUrl).replace(/\\/g, '/');
              const aliases: PathAliases = new Map();
              for (const [pattern, targets] of Object.entries(parentPaths)) {
                if (!Array.isArray(targets)) continue;
                const prefix = pattern.endsWith('/*') ? pattern.slice(0, -1) : pattern;
                const resolvedTargets = (targets as string[]).map(t => {
                  const target = t.endsWith('/*') ? t.slice(0, -1) : t;
                  return path.resolve(baseDir, target).replace(/\\/g, '/');
                });
                aliases.set(prefix, resolvedTargets);
              }
              if (aliases.size > 0) return aliases;
            }
          }
        }
        continue;
      }

      const baseUrl = (config.compilerOptions?.baseUrl ?? '.').replace(/\\/g, '/');
      const baseDir = path.resolve(rootDir, baseUrl).replace(/\\/g, '/');

      const aliases: PathAliases = new Map();
      for (const [pattern, targets] of Object.entries(paths)) {
        if (!Array.isArray(targets)) continue;
        // Strip trailing /* from pattern: "@/*" → "@/"
        const prefix = pattern.endsWith('/*') ? pattern.slice(0, -1) : pattern;
        const resolvedTargets = (targets as string[]).map(t => {
          const target = t.endsWith('/*') ? t.slice(0, -1) : t;
          return path.resolve(baseDir, target).replace(/\\/g, '/');
        });
        aliases.set(prefix, resolvedTargets);
      }

      if (aliases.size > 0) return aliases;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Try to resolve an import source using path aliases.
 * Returns the resolved absolute path or null.
 */
function resolveWithAlias(
  importSource: string,
  pathAliases: PathAliases,
  projectFiles: Set<string>,
): string | null {
  for (const [prefix, targets] of pathAliases) {
    if (!importSource.startsWith(prefix)) continue;

    const rest = importSource.slice(prefix.length);
    for (const targetDir of targets) {
      const resolved = (targetDir + '/' + rest).replace(/\/\//g, '/').replace(/\\/g, '/');

      // Try exact match
      if (projectFiles.has(resolved)) return resolved;

      // Try extension probing
      for (const ext of EXTENSIONS_TO_PROBE) {
        if (projectFiles.has(resolved + ext)) return resolved + ext;
      }

      // Try index file
      for (const indexFile of INDEX_FILES) {
        if (projectFiles.has(resolved + '/' + indexFile)) return resolved + '/' + indexFile;
      }

      // Try ESM extension mapping
      const sourceExt = path.extname(rest);
      const tsExt = ESM_EXTENSION_MAP[sourceExt];
      if (tsExt) {
        const stripped = resolved.slice(0, -sourceExt.length);
        if (projectFiles.has(stripped + tsExt)) return stripped + tsExt;
      }
    }
  }

  return null;
}

// Monorepo workspace package map cache
let workspaceMapCache: Map<string, string> | null = null;
let workspaceMapRoot: string | null = null;

/**
 * Build a mapping of package name → source directory for monorepo workspaces.
 */
function getWorkspaceMap(fromFile: string): Map<string, string> {
  // Find the root by walking up from the importing file
  let dir = path.dirname(fromFile).replace(/\\/g, '/');
  const searched: string[] = [];
  while (dir.length > 3) {
    searched.push(dir);
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const raw = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw);
        if (pkg.workspaces) {
          if (workspaceMapRoot === dir && workspaceMapCache) return workspaceMapCache;
          workspaceMapRoot = dir;
          workspaceMapCache = new Map();
          // workspaces can be string[] or { packages: string[] }
          const patterns: string[] = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages ?? [];
          for (const pattern of patterns) {
            // Resolve glob: "packages/*" → list actual directories
            const base = pattern.replace(/\/?\*$/, '');
            const absBase = path.resolve(dir, base).replace(/\\/g, '/');
            if (!fs.existsSync(absBase)) continue;
            const entries = fs.readdirSync(absBase, { withFileTypes: true });
            for (const entry of entries) {
              if (!entry.isDirectory()) continue;
              const pkgDir = `${absBase}/${entry.name}`;
              const childPkg = `${pkgDir}/package.json`;
              if (fs.existsSync(childPkg)) {
                try {
                  const childRaw = fs.readFileSync(childPkg, 'utf-8');
                  const child = JSON.parse(childRaw);
                  if (child.name) {
                    // Map package name to its src/ or root directory
                    const srcDir = fs.existsSync(`${pkgDir}/src`) ? `${pkgDir}/src` : pkgDir;
                    workspaceMapCache!.set(child.name, srcDir);
                  }
                } catch { /* skip */ }
              }
            }
          }
          return workspaceMapCache;
        }
      } catch { /* skip */ }
    }
    const parent = path.dirname(dir).replace(/\\/g, '/');
    if (parent === dir) break;
    dir = parent;
  }
  return new Map();
}

/**
 * Try to resolve a bare/scoped import via monorepo workspace packages.
 * e.g. "@calcom/lib/utils" → packages/lib/src/utils.ts
 */
function resolveWorkspaceImport(
  importSource: string,
  importingFilePath: string,
  projectFiles: Set<string>,
): string | null {
  const wsMap = getWorkspaceMap(importingFilePath);
  if (wsMap.size === 0) return null;

  // Try matching progressively shorter prefixes
  // e.g. "@calcom/lib/utils" → try "@calcom/lib" then "@calcom"
  const parts = importSource.split('/');
  for (let i = parts.length; i >= 1; i--) {
    const prefix = parts[0].startsWith('@') ? parts.slice(0, Math.max(2, i)).join('/') : parts.slice(0, i).join('/');
    const rest = importSource.slice(prefix.length).replace(/^\//, '');
    const pkgDir = wsMap.get(prefix);
    if (!pkgDir) continue;

    const base = rest ? `${pkgDir}/${rest}` : pkgDir;

    // Try exact, extension probing, index
    if (projectFiles.has(base)) return base;
    for (const ext of EXTENSIONS_TO_PROBE) {
      if (projectFiles.has(base + ext)) return base + ext;
    }
    for (const idx of INDEX_FILES) {
      if (projectFiles.has(base + '/' + idx)) return base + '/' + idx;
    }
    // If prefix consumed all parts, stop
    if (parts.slice(0, parts[0].startsWith('@') ? 2 : 1).join('/') === prefix && !rest) break;
  }

  return null;
}

/**
 * Resolve a relative import specifier to an absolute file path.
 * Returns null for bare specifiers (node_modules) or unresolved paths.
 */
export function resolveImportPath(
  importSource: string,
  importingFilePath: string,
  projectFiles: Set<string>,
  pathAliases?: PathAliases | null,
): string | null {
  // Try path aliases first (before rejecting bare specifiers)
  if (pathAliases) {
    const aliased = resolveWithAlias(importSource, pathAliases, projectFiles);
    if (aliased) return aliased;
  }

  // Try monorepo workspace resolution for scoped/bare specifiers
  if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
    const wsResolved = resolveWorkspaceImport(importSource, importingFilePath, projectFiles);
    if (wsResolved) return wsResolved;
    return null;
  }

  const importingDir = path.dirname(importingFilePath);
  const resolved = path.resolve(importingDir, importSource);
  const normalized = resolved.replace(/\\/g, '/');

  // Exact match (file has extension already)
  if (projectFiles.has(normalized)) {
    return normalized;
  }

  // ESM convention: strip .js/.jsx/.mjs/.cjs and try .ts/.tsx/.mts/.cts
  const sourceExt = path.extname(importSource);
  const tsExt = ESM_EXTENSION_MAP[sourceExt];
  if (tsExt) {
    const stripped = normalized.slice(0, -sourceExt.length);
    const candidate = stripped + tsExt;
    if (projectFiles.has(candidate)) {
      return candidate;
    }
    // Also try stripping and probing all extensions
    for (const ext of EXTENSIONS_TO_PROBE) {
      const candidate2 = stripped + ext;
      if (projectFiles.has(candidate2)) {
        return candidate2;
      }
    }
  }

  // Try appending extensions
  for (const ext of EXTENSIONS_TO_PROBE) {
    const candidate = normalized + ext;
    if (projectFiles.has(candidate)) {
      return candidate;
    }
  }

  // Try as directory with index file
  for (const indexFile of INDEX_FILES) {
    const candidate = normalized + '/' + indexFile;
    if (projectFiles.has(candidate)) {
      return candidate;
    }
  }

  return null;
}
