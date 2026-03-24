import * as vscode from 'vscode';
import * as path from 'path';
import { setGrammarDir } from '../parser/treeSitter.js';
import { scanProject } from '../parser/scanner.js';
import { buildDependencyGraph } from '../graph/builder.js';
import { serializeGraph } from '../graph/serializer.js';

export function registerScanCommand(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('DepsView');

  const disposable = vscode.commands.registerCommand('depsview.scan', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('DepsView: No workspace folder open');
      return;
    }

    const rootDir = workspaceFolder.uri.fsPath;
    const grammarDir = path.join(context.extensionPath, 'dist', 'grammars');
    setGrammarDir(grammarDir);

    outputChannel.show();
    outputChannel.appendLine(`Scanning ${rootDir}...`);

    try {
      const results = await scanProject(rootDir);
      const graph = buildDependencyGraph(results, rootDir);
      const scanResult = serializeGraph(graph, rootDir);

      outputChannel.appendLine('');
      outputChannel.appendLine(`Files: ${scanResult.stats.fileCount}`);
      outputChannel.appendLine(`Dependencies: ${scanResult.stats.edgeCount}`);
      outputChannel.appendLine(`Orphans: ${scanResult.stats.orphanCount}`);
      outputChannel.appendLine(`Cycles: ${scanResult.stats.hasCycles ? 'YES' : 'none'}`);
      outputChannel.appendLine('');
      outputChannel.appendLine(JSON.stringify(scanResult, null, 2));

      vscode.window.showInformationMessage(
        `DepsView: Scan complete — ${scanResult.stats.fileCount} files, ${scanResult.stats.edgeCount} dependencies`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Error: ${message}`);
      vscode.window.showErrorMessage(`DepsView: ${message}`);
    }
  });

  context.subscriptions.push(disposable);
}
