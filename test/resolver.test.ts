import { describe, it, expect } from 'vitest';
import { resolveImportPath, type PathAliases } from '../src/parser/resolver';
import * as path from 'path';

// Use platform-appropriate paths so tests work on both Windows and Linux
const root = path.resolve('/project');
const src = path.join(root, 'src').replace(/\\/g, '/');
const projectFiles = new Set([
  `${src}/utils/format.ts`,
  `${src}/utils/index.ts`,
  `${src}/components/Header.tsx`,
  `${src}/App.tsx`,
  `${src}/styles.css`,
]);

describe('resolveImportPath', () => {
  it('resolves relative import with extension probing (.ts)', () => {
    const result = resolveImportPath(
      './utils/format',
      `${src}/App.tsx`,
      projectFiles,
    );
    expect(result).toBe(`${src}/utils/format.ts`);
  });

  it('resolves directory import via index file', () => {
    const result = resolveImportPath(
      './utils',
      `${src}/App.tsx`,
      projectFiles,
    );
    expect(result).toBe(`${src}/utils/index.ts`);
  });

  it('resolves .tsx extension', () => {
    const result = resolveImportPath(
      './components/Header',
      `${src}/App.tsx`,
      projectFiles,
    );
    expect(result).toBe(`${src}/components/Header.tsx`);
  });

  it('resolves exact path with extension', () => {
    const result = resolveImportPath(
      './styles.css',
      `${src}/App.tsx`,
      projectFiles,
    );
    expect(result).toBe(`${src}/styles.css`);
  });

  it('returns null for bare specifiers (node_modules)', () => {
    const result = resolveImportPath(
      'react',
      `${src}/App.tsx`,
      projectFiles,
    );
    expect(result).toBeNull();
  });

  it('returns null for scoped packages', () => {
    const result = resolveImportPath(
      '@tanstack/react-query',
      `${src}/App.tsx`,
      projectFiles,
    );
    expect(result).toBeNull();
  });

  it('returns null for non-existent file', () => {
    const result = resolveImportPath(
      './nonexistent',
      `${src}/App.tsx`,
      projectFiles,
    );
    expect(result).toBeNull();
  });

  it('resolves relative paths going up directories', () => {
    const result = resolveImportPath(
      '../App',
      `${src}/components/Header.tsx`,
      projectFiles,
    );
    expect(result).toBe(`${src}/App.tsx`);
  });

  it('resolves ESM .js extension to .ts file', () => {
    const result = resolveImportPath(
      './utils/format.js',
      `${src}/App.tsx`,
      projectFiles,
    );
    expect(result).toBe(`${src}/utils/format.ts`);
  });

  it('resolves ESM .jsx extension to .tsx file', () => {
    const result = resolveImportPath(
      './components/Header.jsx',
      `${src}/App.tsx`,
      projectFiles,
    );
    expect(result).toBe(`${src}/components/Header.tsx`);
  });

  it('resolves path alias @/* to src/*', () => {
    const aliases: PathAliases = new Map([
      ['@/', [`${src}/`]],
    ]);
    const result = resolveImportPath(
      '@/utils/format',
      `${src}/App.tsx`,
      projectFiles,
      aliases,
    );
    expect(result).toBe(`${src}/utils/format.ts`);
  });

  it('resolves path alias @/components/* to component file', () => {
    const aliases: PathAliases = new Map([
      ['@/', [`${src}/`]],
    ]);
    const result = resolveImportPath(
      '@/components/Header',
      `${src}/App.tsx`,
      projectFiles,
      aliases,
    );
    expect(result).toBe(`${src}/components/Header.tsx`);
  });

  it('resolves path alias with index file', () => {
    const aliases: PathAliases = new Map([
      ['@/', [`${src}/`]],
    ]);
    const result = resolveImportPath(
      '@/utils',
      `${src}/App.tsx`,
      projectFiles,
      aliases,
    );
    expect(result).toBe(`${src}/utils/index.ts`);
  });
});
