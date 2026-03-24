/**
 * Standalone serve command — runs DepsView in a browser without VS Code.
 * Scans the project, serves the webview, watches for file changes, and pushes updates via WebSocket.
 */
import * as path from 'path';
import * as fs from 'fs';
import { setGrammarDir } from '../parser/treeSitter.js';
import { scanProject, scanSingleFile } from '../parser/scanner.js';
import { buildDependencyGraph, patchGraph, deleteNode, addNode } from '../graph/builder.js';
import { serializeGraph } from '../graph/serializer.js';
import { analyze } from '../graph/analyzer.js';
import { computeAllImpact, recomputeImpactForNodes } from '../graph/impact.js';
import { classifyFile } from '../shared/classify.js';
import { generateFileDescription } from '../core/descriptionGenerator.js';
import { startServer, broadcastToClients, setMessageHandler } from '../server/index.js';
import { generateReport } from '../bridge/generator.js';
import { buildFixPrompt } from '../bridge/promptBuilder.js';
import type { DirectedGraph } from 'graphology';
import type { GraphNodeData, GraphEdgeData, ScanResult, DetectionResult } from '../graph/types.js';
import type { FileParseResult } from '../parser/types.js';
import type { GraphDataMessage, ImpactLevels } from '../shared/protocol.js';

const WATCH_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts']);

// State
let cachedGraph: DirectedGraph<GraphNodeData, GraphEdgeData>;
let cachedResults: FileParseResult[];
let cachedProjectFiles: Set<string>;
let cachedImpactScores: Map<string, number>;
let cachedImpactLevels: Map<string, ImpactLevels>;
let cachedDetection: DetectionResult;
let cachedScanResult: ScanResult;
let rootDir: string;

function transformForWebview(
  scanResult: ScanResult,
  impactScores: Map<string, number>,
  impactLevels: Map<string, ImpactLevels>,
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
        impactLevels: impactLevels.get(n.id),
        fileSize: n.data.fileSize,
        complexity: {
          exportRatio: (n.data.exportCount + n.data.importCount) > 0
            ? n.data.exportCount / (n.data.exportCount + n.data.importCount)
            : 0,
        },
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

  return {
    nodes,
    edges,
    stats: scanResult.stats,
    folders: [...folderSet].sort(),
  };
}

async function fullScan(): Promise<void> {
  console.error(`Scanning ${rootDir}...`);
  const results = await scanProject(rootDir);
  const graph = buildDependencyGraph(results, rootDir);

  cachedGraph = graph;
  cachedResults = results;
  cachedProjectFiles = new Set(results.map(r => r.filePath.replace(/\\/g, '/')));

  const { scores, levels } = computeAllImpact(graph);
  cachedImpactScores = scores;
  cachedImpactLevels = levels;

  const detection = analyze(graph, results);
  cachedDetection = detection;

  cachedScanResult = serializeGraph(graph, rootDir, detection);
  const payload = transformForWebview(cachedScanResult, scores, levels);

  broadcastToClients({ type: 'graphData', payload });
  broadcastToClients({
    type: 'detections',
    payload: {
      issues: detection.issues.map(i => ({
        type: i.type,
        severity: i.severity,
        message: i.message,
        filePaths: i.filePaths,
        line: i.line,
      })),
      cycleEdges: detection.cycleEdges,
      healthScore: detection.healthScore,
    },
  });

  console.error(`  ${cachedScanResult.stats.fileCount} files, ${cachedScanResult.stats.edgeCount} deps`);
}

async function incrementalUpdate(filePath: string): Promise<void> {
  const normalized = filePath.replace(/\\/g, '/');
  const fileExists = fs.existsSync(filePath);

  if (!cachedGraph || !cachedResults || !cachedProjectFiles) {
    return fullScan();
  }

  const wasKnown = cachedProjectFiles.has(normalized);
  const graph = cachedGraph;

  // File deleted
  if (!fileExists && wasKnown) {
    const relPath = path.relative(rootDir, normalized).replace(/\\/g, '/');
    deleteNode(graph, relPath);
    cachedProjectFiles.delete(normalized);
    cachedResults = cachedResults.filter(r => r.filePath.replace(/\\/g, '/') !== normalized);
    console.error(`  - ${relPath} (deleted)`);
  }
  // File created
  else if (fileExists && !wasKnown) {
    cachedProjectFiles.add(normalized);
    const newResult = await scanSingleFile(normalized, cachedProjectFiles);
    cachedResults.push(newResult);
    addNode(graph, newResult, rootDir);
    const relPath = path.relative(rootDir, normalized).replace(/\\/g, '/');
    console.error(`  + ${relPath} (created)`);
  }
  // File modified
  else if (fileExists) {
    const newResult = await scanSingleFile(normalized, cachedProjectFiles);
    const oldIndex = cachedResults.findIndex(r => r.filePath.replace(/\\/g, '/') === normalized);
    if (oldIndex === -1) return fullScan();
    cachedResults[oldIndex] = newResult;
    const patch = patchGraph(graph, newResult, rootDir);
    const relPath = path.relative(rootDir, normalized).replace(/\\/g, '/');

    // Selective impact recomputation
    if (patch.addedEdges.length > 0 || patch.removedEdges.length > 0) {
      const result = recomputeImpactForNodes(graph, patch.updatedNodes, cachedImpactScores, cachedImpactLevels);
      cachedImpactScores = result.scores;
      cachedImpactLevels = result.levels;
    }

    console.error(`  ~ ${relPath} (modified)`);
  } else {
    return;
  }

  // Recompute if we haven't already (delete/create paths)
  if (!fileExists || !wasKnown) {
    const { scores, levels } = computeAllImpact(graph);
    cachedImpactScores = scores;
    cachedImpactLevels = levels;
  }

  const detection = analyze(graph, cachedResults);
  cachedDetection = detection;

  cachedScanResult = serializeGraph(graph, rootDir, detection);
  const payload = transformForWebview(cachedScanResult, cachedImpactScores, cachedImpactLevels);

  broadcastToClients({ type: 'graphData', payload });
  broadcastToClients({
    type: 'detections',
    payload: {
      issues: detection.issues.map(i => ({
        type: i.type,
        severity: i.severity,
        message: i.message,
        filePaths: i.filePaths,
        line: i.line,
      })),
      cycleEdges: detection.cycleEdges,
      healthScore: detection.healthScore,
    },
  });
}

function startFileWatcher(): void {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const watcher = fs.watch(rootDir, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const ext = path.extname(filename);
    if (!WATCH_EXTENSIONS.has(ext)) return;

    // Skip node_modules, dist, .git
    if (filename.includes('node_modules') || filename.includes('dist/') || filename.includes('.git/')) return;

    const fullPath = path.join(rootDir, filename);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      incrementalUpdate(fullPath).catch(err => {
        console.error(`Watch update error: ${err.message}`);
      });
    }, 300);
  });

  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });

  console.error('Watching for file changes...');
}

export async function serve(dir: string, port?: number): Promise<void> {
  rootDir = path.resolve(dir);
  if (!fs.existsSync(rootDir)) {
    console.error(`Error: Directory not found: ${rootDir}`);
    process.exit(1);
  }

  // Grammar dir
  const grammarDir = path.join(__dirname, 'grammars');
  if (fs.existsSync(grammarDir)) {
    setGrammarDir(grammarDir);
  }

  // Start server
  const distDir = path.dirname(__dirname); // dist/ directory
  const actualPort = await startServer(distDir, port ?? 7890);

  // Handle WS messages
  setMessageHandler(msg => {
    if (msg.type === 'webviewReady') {
      fullScan().catch(err => console.error(`Scan error: ${err.message}`));
    } else if (msg.type === 'generateReport') {
      if (!cachedScanResult || !cachedDetection || !cachedImpactScores) return;
      const report = generateReport(cachedScanResult, cachedDetection, cachedImpactScores);
      broadcastToClients({ type: 'clipboardContent', payload: { text: report, label: 'Report copied to clipboard' } } as any);
    } else if (msg.type === 'copyPrompt') {
      if (!cachedDetection || !cachedScanResult || !cachedImpactScores) return;
      const issue = cachedDetection.issues[msg.payload.issueIndex];
      if (!issue) return;
      const prompt = buildFixPrompt(issue, cachedScanResult, cachedImpactScores);
      broadcastToClients({ type: 'clipboardContent', payload: { text: prompt, label: 'Fix prompt copied to clipboard' } } as any);
    }
  });

  // Start file watcher
  startFileWatcher();

  console.error(`\nDepsView running at http://localhost:${actualPort}`);
  console.error(`Press Ctrl+C to stop.\n`);
}
