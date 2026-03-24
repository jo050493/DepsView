import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { setGrammarDir } from '../src/parser/treeSitter.js';
import { scanProject, scanSingleFile } from '../src/parser/scanner.js';
import { buildDependencyGraph, patchGraph } from '../src/graph/builder.js';
import { serializeGraph } from '../src/graph/serializer.js';
import { analyze } from '../src/graph/analyzer.js';
import { computeAllImpact, recomputeImpactForNodes } from '../src/graph/impact.js';
import { classifyFile } from '../src/shared/classify.js';
import { generateFileDescription } from '../src/core/descriptionGenerator.js';
import { startServer, broadcastToClients, setMessageHandler } from '../src/server/index.js';
import type { GraphDataMessage, ImpactLevels } from '../src/shared/protocol.js';
import type { ScanResult } from '../src/graph/types.js';
import type { FileParseResult } from '../src/parser/types.js';
import type { DirectedGraph } from 'graphology';
import type { GraphNodeData, GraphEdgeData } from '../src/graph/types.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(scriptDir, '..');
const grammarsDir = path.join(projectRoot, 'grammars');
const distDir = path.join(projectRoot, 'dist');

const targetDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(projectRoot, 'test', 'fixtures', 'react-app');

const WATCHED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts']);

// Incremental cache
let cachedGraph: DirectedGraph<GraphNodeData, GraphEdgeData> | undefined;
let cachedResults: FileParseResult[] | undefined;
let cachedProjectFiles: Set<string> | undefined;
let cachedImpactScores: Map<string, number> | undefined;
let cachedImpactLevels: Map<string, ImpactLevels> | undefined;

function transformForWebview(
  scanResult: ScanResult,
  impactScores: Map<string, number>,
  impactLevelsMap: Map<string, { direct: number; indirect: number; far: number }>,
): GraphDataMessage['payload'] {
  const folderSet = new Set<string>();
  const nodes = scanResult.nodes.map(n => {
    const folder = path.dirname(n.data.relativePath).replace(/\\/g, '/');
    folderSet.add(folder);
    return {
      id: n.id,
      data: {
        filePath: n.data.filePath,
        relativePath: n.data.relativePath,
        exportCount: n.data.exportCount,
        importCount: n.data.importCount,
        extension: n.data.extension,
        category: classifyFile(n.data.relativePath, n.data.extension),
        lastModifiedMs: n.data.lastModifiedMs,
        folder,
        impactScore: impactScores.get(n.id) ?? 0,
        impactLevels: impactLevelsMap.get(n.id),
        description: generateFileDescription({
          relativePath: n.data.relativePath,
          category: classifyFile(n.data.relativePath, n.data.extension),
          exportCount: n.data.exportCount,
          importCount: n.data.importCount,
          extension: n.data.extension,
        }),
      },
    };
  });
  const edges = scanResult.edges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    data: {
      specifiers: e.data.specifiers,
      kind: e.data.kind,
      line: e.data.line,
      specifierCount: e.data.specifiers.length,
    },
  }));
  return { nodes, edges, stats: scanResult.stats, folders: [...folderSet].sort() };
}

function sendToClients(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
  results: FileParseResult[],
  impactScores: Map<string, number>,
  impactLevels: Map<string, ImpactLevels>,
) {
  const detection = analyze(graph, results);
  const scanResult = serializeGraph(graph, targetDir, detection);
  const payload = transformForWebview(scanResult, impactScores, impactLevels);
  console.log(`Sending graph: ${payload.nodes.length} nodes, ${payload.edges.length} edges`);
  broadcastToClients({ type: 'graphData', payload });
  broadcastToClients({
    type: 'detections',
    payload: {
      issues: detection.issues,
      cycleEdges: detection.cycleEdges,
      healthScore: detection.healthScore,
    },
  });
  console.log(`Health: ${detection.healthScore}/100, Issues: ${detection.issues.length}`);
}

async function fullScan() {
  console.log(`[FULL SCAN] ${targetDir}`);

  let t = performance.now();
  const results = await scanProject(targetDir);
  console.log(`  scanProject: ${(performance.now() - t).toFixed(0)}ms (${results.length} files)`);

  t = performance.now();
  const graph = buildDependencyGraph(results, targetDir);
  console.log(`  buildGraph: ${(performance.now() - t).toFixed(0)}ms (${graph.order} nodes, ${graph.size} edges)`);

  t = performance.now();
  const { scores, levels } = computeAllImpact(graph);
  console.log(`  computeAllImpact: ${(performance.now() - t).toFixed(0)}ms`);

  cachedGraph = graph;
  cachedResults = results;
  cachedProjectFiles = new Set(results.map(r => r.filePath.replace(/\\/g, '/')));
  cachedImpactScores = scores;
  cachedImpactLevels = levels;

  t = performance.now();
  sendToClients(graph, results, scores, levels);
  console.log(`  sendToClients (analyze+serialize+transform): ${(performance.now() - t).toFixed(0)}ms`);
}

async function incrementalUpdate(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  const fileExists = fs.existsSync(filePath);

  if (!cachedGraph || !cachedResults || !cachedProjectFiles) {
    return fullScan();
  }

  const wasKnown = cachedProjectFiles.has(normalized);
  if (!fileExists || !wasKnown) {
    console.log(`[FULL RESCAN] File ${fileExists ? 'created' : 'deleted'}: ${path.relative(targetDir, filePath)}`);
    return fullScan();
  }

  console.log(`[INCREMENTAL] ${path.relative(targetDir, filePath)}`);
  const newResult = await scanSingleFile(normalized, cachedProjectFiles);

  const oldIndex = cachedResults.findIndex(r => r.filePath.replace(/\\/g, '/') === normalized);
  if (oldIndex === -1) return fullScan();

  cachedResults[oldIndex] = newResult;
  const patch = patchGraph(cachedGraph, newResult, targetDir);

  const hasStructuralChange = patch.addedEdges.length > 0 || patch.removedEdges.length > 0;
  let impactScores: Map<string, number>;
  let impactLevels: Map<string, ImpactLevels>;

  if (hasStructuralChange && cachedImpactScores && cachedImpactLevels) {
    console.log(`  Structural change: +${patch.addedEdges.length} -${patch.removedEdges.length} edges`);
    const result = recomputeImpactForNodes(cachedGraph, patch.updatedNodes, cachedImpactScores, cachedImpactLevels);
    impactScores = result.scores;
    impactLevels = result.levels;
  } else if (cachedImpactScores && cachedImpactLevels) {
    console.log(`  No structural change — reusing cached impact`);
    impactScores = cachedImpactScores;
    impactLevels = cachedImpactLevels;
  } else {
    const result = computeAllImpact(cachedGraph);
    impactScores = result.scores;
    impactLevels = result.levels;
  }
  cachedImpactScores = impactScores;
  cachedImpactLevels = impactLevels;

  sendToClients(cachedGraph, cachedResults, impactScores, impactLevels);
}

async function main() {
  console.log(`Setting up grammars from: ${grammarsDir}`);
  setGrammarDir(grammarsDir);

  console.log(`Starting server...`);
  const port = await startServer(distDir);
  console.log(`Server running at http://localhost:${port}`);

  let scanning = false;

  setMessageHandler((msg) => {
    console.log(`WS message received: ${msg.type}`);
    if (msg.type === 'webviewReady') {
      if (!scanning) {
        scanning = true;
        fullScan().then(() => { scanning = false; });
      }
    }
  });

  // File watcher for incremental updates
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let debounceFullScan: ReturnType<typeof setTimeout> | undefined;

  fs.watch(targetDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const ext = path.extname(filename);
    if (!WATCHED_EXTENSIONS.has(ext)) return;
    // Skip node_modules, dist, .git
    if (filename.includes('node_modules') || filename.includes('dist') || filename.includes('.git')) return;

    const fullPath = path.join(targetDir, filename);

    if (eventType === 'rename') {
      // File created or deleted — full rescan
      if (debounceFullScan) clearTimeout(debounceFullScan);
      debounceFullScan = setTimeout(() => {
        fullScan();
      }, 500);
    } else {
      // File changed — incremental
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        incrementalUpdate(fullPath);
      }, 500);
    }
  });

  console.log(`\nOpen http://localhost:${port} in your browser to see the graph.`);
  console.log(`Scanning target: ${targetDir}`);
  console.log(`Watching for file changes... (JS/TS files)`);
  console.log(`Press Ctrl+C to stop.\n`);
}

main().catch(console.error);
