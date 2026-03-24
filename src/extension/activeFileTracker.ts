import * as vscode from 'vscode';
import * as path from 'path';
import { postActiveFile, getPanel } from './webviewPanel.js';

export function registerActiveFileTracker(context: vscode.ExtensionContext): void {
  const disposable = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (!getPanel()) return;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!editor || !workspaceFolder) {
      postActiveFile(null);
      return;
    }

    const filePath = editor.document.uri.fsPath;
    const rootDir = workspaceFolder.uri.fsPath;
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    postActiveFile(relativePath);
  });

  context.subscriptions.push(disposable);
}
