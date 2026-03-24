import * as vscode from 'vscode';
import { getPanel, incrementalUpdate, scanAndSend } from './webviewPanel.js';

const WATCHED_EXTENSIONS = '{js,jsx,ts,tsx,mjs,cjs,mts,cts}';

const outputChannel = vscode.window.createOutputChannel('DepsView');

export function registerFileWatcher(context: vscode.ExtensionContext): void {
  outputChannel.appendLine(`[init] File watcher registered. Workspace: ${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'NONE'}`);
  outputChannel.show(true); // Force show the output channel
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function debouncedUpdate(filePath: string, rootDir: string): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      outputChannel.appendLine(`[watcher] update: ${filePath} (panel: ${!!getPanel()})`);
      outputChannel.appendLine(`[watcher] calling incrementalUpdate...`);
      try {
        incrementalUpdate(filePath, rootDir).then(() => {
          outputChannel.appendLine(`[watcher] update DONE`);
        }).catch(err => {
          outputChannel.appendLine(`[watcher] ASYNC ERROR: ${err?.message}\n${err?.stack}`);
        });
        outputChannel.appendLine(`[watcher] incrementalUpdate called (async)`);
      } catch (err: any) {
        outputChannel.appendLine(`[watcher] SYNC ERROR: ${err?.message}\n${err?.stack}`);
      }
    }, 500);
  }

  function debouncedFullScan(rootDir: string): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      scanAndSend(rootDir);
    }, 500);
  }

  // Watch file saves — incremental patch for existing files
  const saveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
    outputChannel.appendLine(`[save] ${document.uri.fsPath} (panel: ${!!getPanel()})`);
    if (!getPanel()) return;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;
    debouncedUpdate(document.uri.fsPath, workspaceFolder.uri.fsPath);
  });

  // Watch file create/delete/rename/change — covers external tools (Claude, Cursor, etc.)
  const watcher = vscode.workspace.createFileSystemWatcher(`**/*.${WATCHED_EXTENSIONS}`);

  const changeDisposable = watcher.onDidChange((uri) => {
    outputChannel.appendLine(`[change] ${uri.fsPath} (panel: ${!!getPanel()})`);
    if (!getPanel()) return;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;
    debouncedUpdate(uri.fsPath, workspaceFolder.uri.fsPath);
  });

  const createDisposable = watcher.onDidCreate((uri) => {
    if (!getPanel()) return;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;
    debouncedUpdate(uri.fsPath, workspaceFolder.uri.fsPath);
  });

  const deleteDisposable = watcher.onDidDelete((uri) => {
    if (!getPanel()) return;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;
    debouncedUpdate(uri.fsPath, workspaceFolder.uri.fsPath);
  });

  context.subscriptions.push(saveDisposable, watcher, changeDisposable, createDisposable, deleteDisposable);
}
