import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { setGrammarDir } from '../src/parser/treeSitter';
import { scanProject } from '../src/parser/scanner';
import { buildDependencyGraph } from '../src/graph/builder';
import { serializeGraph } from '../src/graph/serializer';
import { analyze } from '../src/graph/analyzer';
import { computeAllImpactScores } from '../src/graph/impact';
import { generateReport } from '../src/bridge/generator';
import { buildFixPrompt } from '../src/bridge/promptBuilder';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const grammarsDir = path.join(testDir, '..', 'grammars');

beforeAll(() => {
  setGrammarDir(grammarsDir);
});

describe('generateReport', () => {
  it('generates valid markdown for healthy project', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const scanResult = serializeGraph(graph, fixtureDir);
    const detection = analyze(graph, results);
    const scores = computeAllImpactScores(graph);

    const md = generateReport(scanResult, detection, scores);

    expect(md).toContain('# DepsView');
    expect(md).toContain('## Metrics');
    expect(md).toContain(`Files: ${scanResult.stats.fileCount}`);
    expect(md).toContain('## Dependencies (Adjacency List)');
    expect(md).toContain('## Folder Summary');
    expect(md).not.toContain('undefined');
  });

  it('generates markdown with critical issues for cyclic project', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'cyclic-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const scanResult = serializeGraph(graph, fixtureDir);
    const detection = analyze(graph, results);
    const scores = computeAllImpactScores(graph);

    const md = generateReport(scanResult, detection, scores);

    expect(md).toContain('## Critical Issues');
    expect(md).toContain('Cycle');
    expect(md).toContain('## Warnings');
  });

  it('includes high-impact files section', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const scanResult = serializeGraph(graph, fixtureDir);
    const detection = analyze(graph, results);
    const scores = computeAllImpactScores(graph);

    const md = generateReport(scanResult, detection, scores);

    expect(md).toContain('## High-Impact Files');
  });
});

describe('buildFixPrompt', () => {
  it('generates cycle fix prompt', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'cyclic-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const scanResult = serializeGraph(graph, fixtureDir);
    const detection = analyze(graph, results);
    const scores = computeAllImpactScores(graph);

    const cycleIssue = detection.issues.find(i => i.type === 'cycle');
    expect(cycleIssue).toBeDefined();

    const prompt = buildFixPrompt(cycleIssue!, scanResult, scores);

    expect(prompt).toContain('Context:');
    expect(prompt).toContain('Problem:');
    expect(prompt).toContain('Action:');
    expect(prompt).toContain('circular dependency');
  });

  it('generates phantom fix prompt', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'cyclic-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const scanResult = serializeGraph(graph, fixtureDir);
    const detection = analyze(graph, results);
    const scores = computeAllImpactScores(graph);

    const phantomIssue = detection.issues.find(i => i.type === 'phantom');
    expect(phantomIssue).toBeDefined();

    const prompt = buildFixPrompt(phantomIssue!, scanResult, scores);

    expect(prompt).toContain('Phantom import');
    expect(prompt).toContain('Action:');
  });

  it('generates orphan fix prompt', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'cyclic-app');
    const results = await scanProject(fixtureDir);
    const graph = buildDependencyGraph(results, fixtureDir);
    const scanResult = serializeGraph(graph, fixtureDir);
    const detection = analyze(graph, results);
    const scores = computeAllImpactScores(graph);

    const orphanIssue = detection.issues.find(i => i.type === 'orphan');
    expect(orphanIssue).toBeDefined();

    const prompt = buildFixPrompt(orphanIssue!, scanResult, scores);

    expect(prompt).toContain('Orphaned files');
    expect(prompt).toContain('Action:');
  });
});
