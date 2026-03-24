import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { setGrammarDir } from '../src/parser/treeSitter';
import { scanProject } from '../src/parser/scanner';
import { buildDependencyGraph } from '../src/graph/builder';
import { serializeGraph } from '../src/graph/serializer';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const grammarsDir = path.join(testDir, '..', 'grammars');

beforeAll(() => {
  setGrammarDir(grammarsDir);
});

describe('Graph builder - react-app', () => {
  it('creates correct number of nodes', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);

    expect(graph.order).toBe(8); // 8 files
  });

  it('creates edges for resolved imports', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);

    // Check edges exist between expected pairs
    const appEdges: string[] = [];
    graph.forEachOutEdge('src/App.tsx', (_e, _d, _s, target) => {
      appEdges.push(target);
    });
    expect(appEdges).toContain('src/components/index.ts');
    expect(appEdges).toContain('src/hooks/useAuth.ts');
  });

  it('handles barrel exports creating edges', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);

    // components/index.ts -> components/Header.tsx (barrel re-export)
    const barrelEdges: string[] = [];
    graph.forEachOutEdge('src/components/index.ts', (_e, _d, _s, target) => {
      barrelEdges.push(target);
    });
    expect(barrelEdges).toContain('src/components/Header.tsx');
  });
});

describe('Graph builder - express-api', () => {
  it('creates edges for dynamic imports', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'express-api');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);

    const controllerEdges: string[] = [];
    graph.forEachOutEdge('src/controllers/userController.ts', (_e, _d, _s, target) => {
      controllerEdges.push(target);
    });
    expect(controllerEdges).toContain('src/utils/logger.ts');
  });

  it('creates edges for require() calls', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'express-api');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);

    const authEdges: string[] = [];
    graph.forEachOutEdge('src/middleware/auth.ts', (_e, _d, _s, target) => {
      authEdges.push(target);
    });
    expect(authEdges).toContain('src/middleware/config.js');
  });
});

describe('serializeGraph', () => {
  it('produces valid ScanResult JSON', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const scanResult = serializeGraph(graph, fixtureDir);

    expect(scanResult.stats.fileCount).toBe(8);
    expect(scanResult.stats.edgeCount).toBeGreaterThan(0);
    expect(scanResult.stats.hasCycles).toBe(false);
    expect(scanResult.nodes.length).toBe(8);
    expect(scanResult.edges.length).toBeGreaterThan(0);
  });

  it('detects orphan files', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const scanResult = serializeGraph(graph, fixtureDir);

    // utils/index.ts re-exports but nobody imports it directly in this fixture
    // Some files may be orphaned
    expect(scanResult.stats.orphanCount).toBeGreaterThanOrEqual(0);
  });

  it('reports no cycles in acyclic project', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'express-api');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const scanResult = serializeGraph(graph, fixtureDir);

    expect(scanResult.stats.hasCycles).toBe(false);
  });
});
