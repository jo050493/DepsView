import * as vscode from 'vscode';
import * as path from 'path';
import { registerScanCommand } from './commands.js';
import { registerGraphCommand, scanAndSend, postFocusFile, getPanel } from './webviewPanel.js';
import { registerActiveFileTracker } from './activeFileTracker.js';
import { registerFileWatcher } from './fileWatcher.js';
import { registerBridgeCommands } from './bridgeCommands.js';
import { registerConfigCommands, loadConfig } from './configPanel.js';
import { createStatusBar, updateHealthScore } from './statusBar.js';
import { createDiagnostics, updateDiagnostics } from './diagnostics.js';
import { startServer, setMessageHandler } from '../server/index.js';
import { setGrammarDir } from '../parser/treeSitter.js';
import { scanProject } from '../parser/scanner.js';
import { buildDependencyGraph } from '../graph/builder.js';
import { analyze } from '../graph/analyzer.js';
import type { WebviewToExtensionMessage } from '../shared/protocol.js';

let serverPort: number | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // Register all commands
  registerScanCommand(context);
  registerGraphCommand(context);
  registerActiveFileTracker(context);
  registerFileWatcher(context);
  registerBridgeCommands(context);
  registerConfigCommands(context);

  // Status bar + diagnostics
  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);
  createDiagnostics(context);

  // Open in browser command
  const openBrowserDisposable = vscode.commands.registerCommand('depsview.openBrowser', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('DepsView: No workspace folder open');
      return;
    }

    // Start server if not running
    if (!serverPort) {
      const distDir = path.join(context.extensionPath, 'dist');
      serverPort = await startServer(distDir);

      // Handle WS messages the same way as webview
      setMessageHandler((msg: WebviewToExtensionMessage) => {
        if (msg.type === 'openFile') {
          const uri = vscode.Uri.file(msg.payload.filePath);
          vscode.workspace.openTextDocument(uri).then(doc => {
            vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
          });
        } else if (msg.type === 'webviewReady') {
          scanAndSend(workspaceFolder.uri.fsPath);
        }
      });
    }

    const url = vscode.Uri.parse(`http://localhost:${serverPort}`);
    vscode.env.openExternal(url);
  });
  context.subscriptions.push(openBrowserDisposable);

  // Focus current file in graph command
  const focusFileDisposable = vscode.commands.registerCommand('depsview.focusCurrentFile', async () => {
    const editor = vscode.window.activeTextEditor;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!editor || !workspaceFolder) {
      vscode.window.showErrorMessage('DepsView: No file open');
      return;
    }

    const relativePath = path.relative(workspaceFolder.uri.fsPath, editor.document.uri.fsPath).replace(/\\/g, '/');

    // Open graph panel if not open, then focus the file
    if (!getPanel()) {
      await vscode.commands.executeCommand('depsview.showGraph');
      // Wait for webview to be ready before sending focus
      setTimeout(() => postFocusFile(relativePath), 2000);
    } else {
      postFocusFile(relativePath);
    }
  });
  context.subscriptions.push(focusFileDisposable);

  // Initial health score scan (if workspace open)
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const grammarDir = path.join(context.extensionPath, 'dist', 'grammars');
    setGrammarDir(grammarDir);

    // Async initial scan for status bar
    scanProject(workspaceFolder.uri.fsPath).then(results => {
      const graph = buildDependencyGraph(results, workspaceFolder.uri.fsPath);
      const config = loadConfig(workspaceFolder.uri.fsPath);
      const detection = analyze(graph, results, config.couplingThreshold, config.entryPointPatterns);
      updateHealthScore(detection.healthScore, detection.issues.length);
      updateDiagnostics(detection.issues, workspaceFolder.uri.fsPath);
    }).catch(() => {
      // Silently fail — status bar stays at default
    });
  }
}

export function deactivate(): void {
  // cleanup handled by VS Code disposables
}
