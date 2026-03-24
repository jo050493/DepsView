import { describe, it, expect } from 'vitest';
import { resolveImportPath, type PathAliases } from '../src/parser/resolver';

const projectFiles = new Set([
  'D:/project/src/utils/format.ts',
  'D:/project/src/utils/index.ts',
  'D:/project/src/components/Header.tsx',
  'D:/project/src/App.tsx',
  'D:/project/src/styles.css',
]);

describe('resolveImportPath', () => {
  it('resolves relative import with extension probing (.ts)', () => {
    const result = resolveImportPath(
      './utils/format',
      'D:/project/src/App.tsx',
      projectFiles,
    );
    expect(result).toBe('D:/project/src/utils/format.ts');
  });

  it('resolves directory import via index file', () => {
    const result = resolveImportPath(
      './utils',
      'D:/project/src/App.tsx',
      projectFiles,
    );
    expect(result).toBe('D:/project/src/utils/index.ts');
  });

  it('resolves .tsx extension', () => {
    const result = resolveImportPath(
      './components/Header',
      'D:/project/src/App.tsx',
      projectFiles,
    );
    expect(result).toBe('D:/project/src/components/Header.tsx');
  });

  it('resolves exact path with extension', () => {
    const result = resolveImportPath(
      './styles.css',
      'D:/project/src/App.tsx',
      projectFiles,
    );
    expect(result).toBe('D:/project/src/styles.css');
  });

  it('returns null for bare specifiers (node_modules)', () => {
    const result = resolveImportPath(
      'react',
      'D:/project/src/App.tsx',
      projectFiles,
    );
    expect(result).toBeNull();
  });

  it('returns null for scoped packages', () => {
    const result = resolveImportPath(
      '@tanstack/react-query',
      'D:/project/src/App.tsx',
      projectFiles,
    );
    expect(result).toBeNull();
  });

  it('returns null for non-existent file', () => {
    const result = resolveImportPath(
      './nonexistent',
      'D:/project/src/App.tsx',
      projectFiles,
    );
    expect(result).toBeNull();
  });

  it('resolves relative paths going up directories', () => {
    const result = resolveImportPath(
      '../App',
      'D:/project/src/components/Header.tsx',
      projectFiles,
    );
    expect(result).toBe('D:/project/src/App.tsx');
  });

  it('resolves ESM .js extension to .ts file', () => {
    const result = resolveImportPath(
      './utils/format.js',
      'D:/project/src/App.tsx',
      projectFiles,
    );
    expect(result).toBe('D:/project/src/utils/format.ts');
  });

  it('resolves ESM .jsx extension to .tsx file', () => {
    const result = resolveImportPath(
      './components/Header.jsx',
      'D:/project/src/App.tsx',
      projectFiles,
    );
    expect(result).toBe('D:/project/src/components/Header.tsx');
  });

  it('resolves path alias @/* to src/*', () => {
    const aliases: PathAliases = new Map([
      ['@/', ['D:/project/src/']],
    ]);
    const result = resolveImportPath(
      '@/utils/format',
      'D:/project/src/App.tsx',
      projectFiles,
      aliases,
    );
    expect(result).toBe('D:/project/src/utils/format.ts');
  });

  it('resolves path alias @/components/* to component file', () => {
    const aliases: PathAliases = new Map([
      ['@/', ['D:/project/src/']],
    ]);
    const result = resolveImportPath(
      '@/components/Header',
      'D:/project/src/App.tsx',
      projectFiles,
      aliases,
    );
    expect(result).toBe('D:/project/src/components/Header.tsx');
  });

  it('resolves path alias with index file', () => {
    const aliases: PathAliases = new Map([
      ['@/', ['D:/project/src/']],
    ]);
    const result = resolveImportPath(
      '@/utils',
      'D:/project/src/App.tsx',
      projectFiles,
      aliases,
    );
    expect(result).toBe('D:/project/src/utils/index.ts');
  });
});
