import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { setGrammarDir } from '../src/parser/treeSitter';
import { scanProject, scanSingleFile } from '../src/parser/scanner';
import { buildDependencyGraph, patchGraph } from '../src/graph/builder';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const grammarsDir = path.join(testDir, '..', 'grammars');
const fixtureDir = path.join(testDir, 'fixtures', 'react-app');

beforeAll(() => {
  setGrammarDir(grammarsDir);
});

describe('patchGraph', () => {
  it('detects no changes when file content is unchanged', async () => {
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const edgeCountBefore = graph.size;

    // Re-parse App.tsx without modifying it
    const projectFiles = new Set(results.map(r => r.filePath.replace(/\\/g, '/')));
    const appPath = path.join(fixtureDir, 'src', 'App.tsx').replace(/\\/g, '/');
    const newResult = await scanSingleFile(appPath, projectFiles);

    const patch = patchGraph(graph, newResult, fixtureDir);

    expect(patch.addedEdges).toHaveLength(0);
    expect(patch.removedEdges).toHaveLength(0);
    expect(patch.updatedNodes).toContain('src/App.tsx');
    expect(graph.size).toBe(edgeCountBefore);
  });

  it('returns empty patch for unknown node', async () => {
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);

    const fakeResult = {
      filePath: path.join(fixtureDir, 'src', 'doesNotExist.ts').replace(/\\/g, '/'),
      imports: [],
      exports: [],
    };

    const patch = patchGraph(graph, fakeResult, fixtureDir);
    expect(patch.addedEdges).toHaveLength(0);
    expect(patch.removedEdges).toHaveLength(0);
    expect(patch.updatedNodes).toHaveLength(0);
  });

  it('updates node attributes (export/import counts)', async () => {
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const projectFiles = new Set(results.map(r => r.filePath.replace(/\\/g, '/')));

    const appPath = path.join(fixtureDir, 'src', 'App.tsx').replace(/\\/g, '/');
    const newResult = await scanSingleFile(appPath, projectFiles);

    patchGraph(graph, newResult, fixtureDir);

    const attrs = graph.getNodeAttributes('src/App.tsx');
    expect(attrs.exportCount).toBe(newResult.exports.length);
    expect(attrs.importCount).toBe(newResult.imports.length);
  });

  it('detects removed edges when imports are dropped', async () => {
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);

    // App.tsx imports components/index.ts and hooks/useAuth.ts
    const appOutEdges: string[] = [];
    graph.forEachOutEdge('src/App.tsx', (_e, _d, _s, target) => {
      appOutEdges.push(target);
    });
    expect(appOutEdges.length).toBeGreaterThanOrEqual(2);

    // Simulate App.tsx with NO imports
    const fakeResult = {
      filePath: path.join(fixtureDir, 'src', 'App.tsx').replace(/\\/g, '/'),
      imports: [],
      exports: [{ name: 'default', kind: 'function' as const, line: 1 }],
    };

    const patch = patchGraph(graph, fakeResult, fixtureDir);

    expect(patch.removedEdges.length).toBe(appOutEdges.length);
    expect(patch.addedEdges).toHaveLength(0);

    // Graph should have no outgoing edges from App.tsx
    const remaining: string[] = [];
    graph.forEachOutEdge('src/App.tsx', (_e, _d, _s, target) => {
      remaining.push(target);
    });
    expect(remaining).toHaveLength(0);
  });

  it('detects added edges when new imports are introduced', async () => {
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);

    // useAuth.ts initially imports from services/api.ts
    // Simulate adding an import to utils/format.ts
    const useAuthPath = path.join(fixtureDir, 'src', 'hooks', 'useAuth.ts').replace(/\\/g, '/');
    const projectFiles = new Set(results.map(r => r.filePath.replace(/\\/g, '/')));
    const original = await scanSingleFile(useAuthPath, projectFiles);

    const fakeResult = {
      ...original,
      imports: [
        ...original.imports,
        {
          source: '../utils/format',
          specifiers: [{ name: 'formatDate', alias: null }],
          kind: 'value' as const,
          line: 99,
          isDynamic: false,
          resolvedPath: path.join(fixtureDir, 'src', 'utils', 'format.ts').replace(/\\/g, '/'),
        },
      ],
    };

    const edgesBefore = graph.size;
    const patch = patchGraph(graph, fakeResult, fixtureDir);

    expect(patch.addedEdges.length).toBeGreaterThanOrEqual(1);
    const addedTargets = patch.addedEdges.map(e => e.target);
    expect(addedTargets).toContain('src/utils/format.ts');
    expect(graph.size).toBe(edgesBefore + patch.addedEdges.length);
  });

  it('updatedNodes includes targets of added/removed edges', async () => {
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);

    // Remove all imports from App.tsx
    const fakeResult = {
      filePath: path.join(fixtureDir, 'src', 'App.tsx').replace(/\\/g, '/'),
      imports: [],
      exports: [{ name: 'default', kind: 'function' as const, line: 1 }],
    };

    const patch = patchGraph(graph, fakeResult, fixtureDir);

    // updatedNodes should include App.tsx + all targets that lost incoming edges
    expect(patch.updatedNodes).toContain('src/App.tsx');
    expect(patch.updatedNodes).toContain('src/components/index.ts');
    expect(patch.updatedNodes).toContain('src/hooks/useAuth.ts');
  });
});
