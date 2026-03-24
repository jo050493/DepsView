import * as path from 'path';
import * as fs from 'fs';
import type { FileParseResult } from '../parser/types.js';

const CACHE_VERSION = 2;
const CACHE_FILE = '.depsview-cache.json';

interface CacheEntry {
  filePath: string;
  mtimeMs: number;
  result: FileParseResult;
}

interface DiskCache {
  version: number;
  entries: CacheEntry[];
}

/**
 * Load cached scan results from disk.
 * Returns a Map of filePath → { mtimeMs, result } for files that haven't changed.
 */
export function loadDiskCache(rootDir: string): Map<string, CacheEntry> {
  const cachePath = path.join(rootDir, '.depsview', CACHE_FILE);
  const map = new Map<string, CacheEntry>();

  if (!fs.existsSync(cachePath)) return map;

  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const cache = JSON.parse(raw) as DiskCache;
    if (cache.version !== CACHE_VERSION) return map;

    for (const entry of cache.entries) {
      map.set(entry.filePath, entry);
    }
  } catch {
    // Corrupt cache — ignore
  }

  return map;
}

/**
 * Save scan results to disk for faster subsequent loads.
 */
export function saveDiskCache(rootDir: string, results: FileParseResult[]): void {
  const cacheDir = path.join(rootDir, '.depsview');
  const cachePath = path.join(cacheDir, CACHE_FILE);

  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const entries: CacheEntry[] = results.map(r => {
      const normalized = r.filePath.replace(/\\/g, '/');
      let mtimeMs = 0;
      try { mtimeMs = fs.statSync(normalized).mtimeMs; } catch { /* file may be gone */ }
      return { filePath: normalized, mtimeMs, result: r };
    });

    const cache: DiskCache = { version: CACHE_VERSION, entries };
    fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf-8');
  } catch {
    // Non-critical — silently fail
  }
}

/**
 * Check if a cached entry is still valid (file hasn't been modified).
 */
export function isCacheEntryValid(entry: CacheEntry): boolean {
  try {
    const stat = fs.statSync(entry.filePath);
    return stat.mtimeMs === entry.mtimeMs;
  } catch {
    return false;
  }
}
