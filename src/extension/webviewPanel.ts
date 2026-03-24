import * as vscode from 'vscode';
import * as path from 'path';
import { setGrammarDir } from '../parser/treeSitter.js';
import { scanProject, scanSingleFile, scanProjectWithCache } from '../parser/scanner.js';
import { buildDependencyGraph, patchGraph, deleteNode, addNode } from '../graph/builder.js';
import { serializeGraph } from '../graph/serializer.js';
import { classifyFile } from '../shared/classify.js';
import { analyze } from '../graph/analyzer.js';
import { computeAllImpact, recomputeImpactForNodes } from '../graph/impact.js';
import { handleCopyPrompt } from './bridgeCommands.js';
import { loadConfig } from './configPanel.js';
import { updateDiagnostics } from './diagnostics.js';
import { updateHealthScore } from './statusBar.js';
import { runScanInWorker } from './workerHost.js';
import { generateFileDescription } from '../core/descriptionGenerator.js';
import { broadcastToClients } from '../server/index.js';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage, GraphDataMessage, ImpactLevels } from '../shared/protocol.js';
import type { ScanResult } from '../graph/types.js';
import type { FileParseResult } from '../parser/types.js';
import type { DirectedGraph } from 'graphology';
import type { GraphNodeData, GraphEdgeData } from '../graph/types.js';

import * as fs from 'fs';

let currentPanel: vscode.WebviewPanel | undefined;

// Cache for incremental updates
let cachedGraph: DirectedGraph<GraphNodeData, GraphEdgeData> | undefined;
let cachedResults: FileParseResult[] | undefined;
let cachedProjectFiles: Set<string> | undefined;
let cachedRootDir: string | undefined;
let cachedImpactScores: Map<string, number> | undefined;
let cachedImpactLevels: Map<string, ImpactLevels> | undefined;
let cachedDetectionResult: ReturnType<typeof analyze> | undefined;

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

export async function scanAndSend(rootDir: string, grammarDir?: string): Promise<void> {
  if (!currentPanel) return;

  // Try worker thread for non-blocking scan, fallback to cached scan, then direct scan
  let results: FileParseResult[];
  if (grammarDir) {
    try {
      results = await runScanInWorker(rootDir, grammarDir);
    } catch {
      // Fallback: worker may fail in some environments (WASM limitations)
      results = await scanProjectWithCache(rootDir);
    }
  } else {
    results = await scanProjectWithCache(rootDir);
  }
  const graph = buildDependencyGraph(results, rootDir);

  // Cache for incremental updates
  cachedGraph = graph;
  cachedResults = results;
  cachedRootDir = rootDir;
  cachedProjectFiles = new Set(results.map(r => r.filePath.replace(/\\/g, '/')));

  // Load config and compute impact scores, levels, and detections
  const config = loadConfig(rootDir);
  const { scores: impactScores, levels: impactLevels } = computeAllImpact(graph);
  cachedImpactScores = impactScores;
  cachedImpactLevels = impactLevels;
  const detectionResult = analyze(graph, results, config.couplingThreshold, config.entryPointPatterns);
  cachedDetectionResult = detectionResult;
  updateDiagnostics(detectionResult.issues, rootDir);
  updateHealthScore(detectionResult.healthScore, detectionResult.issues.length);
  // Serialize with detection result so orphanCount respects exclusion patterns
  const scanResult = serializeGraph(graph, rootDir, detectionResult);

  const payload = transformForWebview(scanResult, impactScores, impactLevels);
  postToWebview({ type: 'graphData', payload });

  // Send detection results
  postToWebview({
    type: 'detections',
    payload: {
      issues: detectionResult.issues.map(i => ({
        type: i.type,
        severity: i.severity,
        message: i.message,
        filePaths: i.filePaths,
        line: i.line,
      })),
      cycleEdges: detectionResult.cycleEdges,
      healthScore: detectionResult.healthScore,
    },
  });
}

/**
 * Incremental update: re-parse only the changed file, update the graph, re-send.
 * Falls back to full scan if cache is missing or file is new/deleted.
 */
let _log: vscode.OutputChannel | undefined;
function getLog(): vscode.OutputChannel {
  if (!_log) _log = vscode.window.createOutputChannel('DepsView');
  return _log;
}

export async function incrementalUpdate(filePath: string, rootDir: string): Promise<void> {
  const log = getLog();
  log.appendLine(`[incremental] start: ${filePath}`);
  log.appendLine(`[incremental] panel: ${!!currentPanel}, cache: ${!!cachedGraph}, results: ${!!cachedResults}, files: ${!!cachedProjectFiles}, root: ${!!cachedRootDir}`);

  if (!currentPanel) { log.appendLine('[incremental] ABORT: no panel'); return; }

  const normalized = filePath.replace(/\\/g, '/');
  const fileExists = fs.existsSync(normalized);
  log.appendLine(`[incremental] normalized: ${normalized}, exists: ${fileExists}`);

  // Fallback to full scan if no cache or file was added/deleted
  if (!cachedGraph || !cachedResults || !cachedProjectFiles || !cachedRootDir) {
    log.appendLine('[incremental] no cache → full scan');
    return scanAndSend(rootDir);
  }

  const wasKnown = cachedProjectFiles.has(normalized);
  log.appendLine(`[incremental] wasKnown: ${wasKnown}`);
  const graph = cachedGraph;
  const config = loadConfig(rootDir);

  // Handle file deletion
  if (!fileExists && wasKnown) {
    const relPath = path.relative(rootDir, normalized).replace(/\\/g, '/');
    const affectedNodes = deleteNode(graph, relPath);
    cachedProjectFiles.delete(normalized);
    cachedResults = cachedResults.filter(r => r.filePath.replace(/\\/g, '/') !== normalized);

    const { scores: impactScores, levels: impactLevels } = computeAllImpact(graph);
    cachedImpactScores = impactScores;
    cachedImpactLevels = impactLevels;
    const detectionResult = analyze(graph, cachedResults, config.couplingThreshold, config.entryPointPatterns);
    cachedDetectionResult = detectionResult;
    updateDiagnostics(detectionResult.issues, rootDir);
    updateHealthScore(detectionResult.healthScore, detectionResult.issues.length);

    const scanResult = serializeGraph(graph, rootDir, detectionResult);
    const payload = transformForWebview(scanResult, impactScores, impactLevels);
    postToWebview({ type: 'graphData', payload });
    postToWebview({ type: 'detections', payload: { issues: detectionResult.issues, cycleEdges: detectionResult.cycleEdges, healthScore: detectionResult.healthScore } });
    broadcastToClients({ type: 'graphData', payload });
    return;
  }

  // Handle file creation
  if (fileExists && !wasKnown) {
    cachedProjectFiles.add(normalized);
    const newResult = await scanSingleFile(normalized, cachedProjectFiles);
    cachedResults.push(newResult);
    const affectedNodes = addNode(graph, newResult, rootDir);

    const { scores: impactScores, levels: impactLevels } = computeAllImpact(graph);
    cachedImpactScores = impactScores;
    cachedImpactLevels = impactLevels;
    const detectionResult = analyze(graph, cachedResults, config.couplingThreshold, config.entryPointPatterns);
    cachedDetectionResult = detectionResult;
    updateDiagnostics(detectionResult.issues, rootDir);
    updateHealthScore(detectionResult.healthScore, detectionResult.issues.length);

    const scanResult = serializeGraph(graph, rootDir, detectionResult);
    const payload = transformForWebview(scanResult, impactScores, impactLevels);
    postToWebview({ type: 'graphData', payload });
    postToWebview({ type: 'detections', payload: { issues: detectionResult.issues, cycleEdges: detectionResult.cycleEdges, healthScore: detectionResult.healthScore } });
    broadcastToClients({ type: 'graphData', payload });
    return;
  }

  if (!fileExists) return;

  // Re-parse the single changed file
  const newResult = await scanSingleFile(normalized, cachedProjectFiles);

  // Find and replace the old result
  const oldIndex = cachedResults.findIndex(r => r.filePath.replace(/\\/g, '/') === normalized);
  if (oldIndex === -1) {
    return scanAndSend(rootDir);
  }

  cachedResults[oldIndex] = newResult;

  // Incremental: patch the existing graph instead of full rebuild
  const patch = patchGraph(graph, newResult, rootDir);

  // Selective impact recomputation — only affected nodes + neighbors
  const hasStructuralChange = patch.addedEdges.length > 0 || patch.removedEdges.length > 0;
  let impactScores: Map<string, number>;
  let impactLevels: Map<string, ImpactLevels>;

  if (hasStructuralChange && cachedImpactScores && cachedImpactLevels) {
    const result = recomputeImpactForNodes(graph, patch.updatedNodes, cachedImpactScores, cachedImpactLevels);
    impactScores = result.scores;
    impactLevels = result.levels;
  } else if (cachedImpactScores && cachedImpactLevels) {
    // No structural change — reuse cached scores
    impactScores = cachedImpactScores;
    impactLevels = cachedImpactLevels;
  } else {
    const result = computeAllImpact(graph);
    impactScores = result.scores;
    impactLevels = result.levels;
  }
  cachedImpactScores = impactScores;
  cachedImpactLevels = impactLevels;

  // Only re-run detections if edges changed
  const detectionResult = hasStructuralChange || !cachedDetectionResult
    ? analyze(graph, cachedResults, config.couplingThreshold, config.entryPointPatterns)
    : cachedDetectionResult;
  cachedDetectionResult = detectionResult;
  if (hasStructuralChange) {
    updateDiagnostics(detectionResult.issues, rootDir);
    updateHealthScore(detectionResult.healthScore, detectionResult.issues.length);
  }

  const scanResult = serializeGraph(graph, rootDir, detectionResult);
  const payload = transformForWebview(scanResult, impactScores, impactLevels);
  postToWebview({ type: 'graphData', payload });
  postToWebview({
    type: 'detections',
    payload: {
      issues: detectionResult.issues.map(i => ({
        type: i.type,
        severity: i.severity,
        message: i.message,
        filePaths: i.filePaths,
        line: i.line,
      })),
      cycleEdges: detectionResult.cycleEdges,
      healthScore: detectionResult.healthScore,
    },
  });
}

function postToWebview(message: ExtensionToWebviewMessage): void {
  currentPanel?.webview.postMessage(message);
  broadcastToClients(message);
}

export function postActiveFile(relativePath: string | null): void {
  postToWebview({ type: 'activeFileChanged', payload: { relativePath } });
}

export function postFocusFile(relativePath: string): void {
  postToWebview({ type: 'focusFile', payload: { relativePath } });
}

export function getPanel(): vscode.WebviewPanel | undefined {
  return currentPanel;
}

export function registerGraphCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('depsview.showGraph', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('DepsView: No workspace folder open');
      return;
    }

    const rootDir = workspaceFolder.uri.fsPath;
    const grammarDir = path.join(context.extensionPath, 'dist', 'grammars');
    setGrammarDir(grammarDir);

    if (currentPanel) {
      currentPanel.reveal(vscode.ViewColumn.Beside);
    } else {
      currentPanel = vscode.window.createWebviewPanel(
        'depsViewGraph',
        'DepsView',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
          ],
        },
      );

      currentPanel.webview.html = getWebviewHtml(currentPanel.webview, context.extensionUri);

      currentPanel.webview.onDidReceiveMessage(
        (message: WebviewToExtensionMessage) => {
          switch (message.type) {
            case 'openFile': {
              const uri = vscode.Uri.file(message.payload.filePath);
              vscode.workspace.openTextDocument(uri).then(doc => {
                vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
              });
              break;
            }
            case 'webviewReady':
              scanAndSend(rootDir, grammarDir);
              break;
            case 'copyPrompt':
              handleCopyPrompt(message.payload.issueIndex);
              break;
            case 'generateReport':
              vscode.commands.executeCommand('depsview.generateReport');
              break;
          }
        },
        undefined,
        context.subscriptions,
      );

      currentPanel.onDidDispose(() => {
        currentPanel = undefined;
      });
    }
  });

  context.subscriptions.push(disposable);
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'webview.js'),
  );
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'webview.css'),
  );

  const iconUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'icon.png'),
  );

  const csp = `default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DepsView</title>
  <link rel="stylesheet" href="${cssUri}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; overflow: hidden; background: #0a0e17; }
    .react-flow__node { font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>window.__DEPSVIEW_ICON__="${iconUri}";</script>
  <script src="${scriptUri}"></script>
</body>
</html>`;
}
