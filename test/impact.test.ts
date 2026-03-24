import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { setGrammarDir } from '../src/parser/treeSitter';
import { scanProject } from '../src/parser/scanner';
import { buildDependencyGraph } from '../src/graph/builder';
import { computeImpactRadius, computeAllImpactScores } from '../src/graph/impact';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const grammarsDir = path.join(testDir, '..', 'grammars');

beforeAll(() => {
  setGrammarDir(grammarsDir);
});

describe('impact - react-app', () => {
  it('computes impact radius for a leaf node (utils/config.ts)', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);

    // config.ts is imported by api.ts → useAuth.ts → App.tsx
    const impact = computeImpactRadius(graph, 'src/utils/config.ts');
    expect(impact.totalAffected).toBeGreaterThan(0);
    expect(impact.levels.length).toBeGreaterThan(0);
    expect(impact.levels[0].level).toBe(1);
  });

  it('computes zero impact for root entry (App.tsx)', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);

    // App.tsx has no incoming edges
    const impact = computeImpactRadius(graph, 'src/App.tsx');
    expect(impact.totalAffected).toBe(0);
  });

  it('computes all impact scores', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);

    const scores = computeAllImpactScores(graph);
    expect(scores.size).toBe(8);

    // Leaf utils should have high impact (many files depend on them transitively)
    const configScore = scores.get('src/utils/config.ts') ?? 0;
    expect(configScore).toBeGreaterThan(0);
  });

  it('returns multiple levels for deep chains', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'express-api');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);

    // User.ts → userService.ts → userController.ts → routes/users.ts → index.ts
    const impact = computeImpactRadius(graph, 'src/models/User.ts');
    expect(impact.levels.length).toBeGreaterThanOrEqual(2);
  });
});
