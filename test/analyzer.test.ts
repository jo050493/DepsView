import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { setGrammarDir } from '../src/parser/treeSitter';
import { scanProject } from '../src/parser/scanner';
import { buildDependencyGraph } from '../src/graph/builder';
import { analyze } from '../src/graph/analyzer';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const grammarsDir = path.join(testDir, '..', 'grammars');

beforeAll(() => {
  setGrammarDir(grammarsDir);
});

describe('analyzer - cyclic-app', () => {
  it('detects circular dependencies', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'cyclic-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const detection = analyze(graph, results);

    const cycles = detection.issues.filter(i => i.type === 'cycle');
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0].severity).toBe('critical');
    expect(detection.cycleEdges.length).toBeGreaterThan(0);
  });

  it('detects phantom imports', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'cyclic-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const detection = analyze(graph, results);

    const phantoms = detection.issues.filter(i => i.type === 'phantom');
    expect(phantoms.length).toBeGreaterThan(0);
    expect(phantoms[0].message).toContain('nonexistent');
  });

  it('detects orphan files', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'cyclic-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const detection = analyze(graph, results);

    const orphans = detection.issues.filter(i => i.type === 'orphan');
    expect(orphans.length).toBeGreaterThan(0);
    const orphanPaths = orphans.flatMap(o => o.filePaths);
    expect(orphanPaths.some(p => p.includes('orphan'))).toBe(true);
  });

  it('detects shadow imports (non-existent named export)', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'cyclic-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const detection = analyze(graph, results);

    const shadows = detection.issues.filter(i => i.type === 'shadow');
    expect(shadows.length).toBeGreaterThan(0);
    expect(shadows.some(s => s.message.includes('nonExistentFunction'))).toBe(true);
  });

  it('computes health score less than 100 for problematic project', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'cyclic-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const detection = analyze(graph, results);

    expect(detection.healthScore).toBeLessThan(100);
    expect(detection.healthScore).toBeGreaterThanOrEqual(0);
  });
});

describe('analyzer - react-app (healthy)', () => {
  it('detects no cycles in acyclic project', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const detection = analyze(graph, results);

    const cycles = detection.issues.filter(i => i.type === 'cycle');
    expect(cycles.length).toBe(0);
  });

  it('has high health score for clean project', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const detection = analyze(graph, results);

    expect(detection.healthScore).toBeGreaterThanOrEqual(70);
  });

  it('does not flag barrel-re-exported files as orphans', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const detection = analyze(graph, results);

    const orphans = detection.issues.filter(i => i.type === 'orphan');
    const orphanPaths = orphans.flatMap(o => o.filePaths);
    // Header.tsx is re-exported by components/index.ts (barrel) — not an orphan
    expect(orphanPaths.some(p => p.includes('Header'))).toBe(false);
  });
});

describe('analyzer - barrel-deep (multi-level barrels + exclusion patterns)', () => {
  it('detects only the true orphan file', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'barrel-deep');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const detection = analyze(graph, results);

    const orphans = detection.issues.filter(i => i.type === 'orphan');
    const orphanPaths = orphans.flatMap(o => o.filePaths);
    expect(orphanPaths.some(p => p.includes('orphan'))).toBe(true);
  });

  it('does not flag deep barrel-covered files as orphans (2-level chain)', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'barrel-deep');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const detection = analyze(graph, results);

    const orphans = detection.issues.filter(i => i.type === 'orphan');
    const orphanPaths = orphans.flatMap(o => o.filePaths);

    // TextInput.ts is re-exported by forms/index.ts → components/index.ts → main.ts
    expect(orphanPaths.some(p => p.includes('TextInput'))).toBe(false);
    // Button.ts is re-exported by components/index.ts → main.ts
    expect(orphanPaths.some(p => p.includes('Button'))).toBe(false);
    // format.ts is re-exported by utils/index.ts → main.ts
    expect(orphanPaths.some(p => p.includes('format.ts'))).toBe(false);
  });

  it('excludes Next.js entry points from orphan detection', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'barrel-deep');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const detection = analyze(graph, results);

    const orphans = detection.issues.filter(i => i.type === 'orphan');
    const orphanPaths = orphans.flatMap(o => o.filePaths);

    expect(orphanPaths.some(p => p.includes('page'))).toBe(false);
    expect(orphanPaths.some(p => p.includes('layout'))).toBe(false);
  });

  it('excludes config and test files from orphan detection', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'barrel-deep');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const detection = analyze(graph, results);

    const orphans = detection.issues.filter(i => i.type === 'orphan');
    const orphanPaths = orphans.flatMap(o => o.filePaths);

    expect(orphanPaths.some(p => p.includes('vite.config'))).toBe(false);
    expect(orphanPaths.some(p => p.includes('.test.'))).toBe(false);
  });
});
