import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface DepsViewConfig {
  couplingThreshold: number;
  ignore: string[];
  entryPointPatterns: string[];
}

const DEFAULT_CONFIG: DepsViewConfig = {
  couplingThreshold: 8,
  ignore: ['**/*.test.*', '**/*.spec.*', '**/dist/**'],
  entryPointPatterns: [],
};

export function loadConfig(workspaceRoot: string): DepsViewConfig {
  // Start with VS Code settings as base (user-level defaults)
  const vsConfig = vscode.workspace.getConfiguration('depsview');
  const vsEntryPointPatterns = vsConfig.get<string[]>('entryPointPatterns', []);
  const vsCouplingThreshold = vsConfig.get<number>('couplingThreshold', DEFAULT_CONFIG.couplingThreshold);

  const base: DepsViewConfig = {
    couplingThreshold: vsCouplingThreshold,
    ignore: DEFAULT_CONFIG.ignore,
    entryPointPatterns: vsEntryPointPatterns,
  };

  // Override with .depsview/config.json (project-level, takes priority)
  const configPath = path.join(workspaceRoot, '.depsview', 'config.json');
  if (!fs.existsSync(configPath)) {
    return base;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DepsViewConfig>;
    return {
      couplingThreshold: parsed.couplingThreshold ?? base.couplingThreshold,
      ignore: parsed.ignore ?? base.ignore,
      // Merge both: VS Code settings + project config (deduplicated)
      entryPointPatterns: [...new Set([...base.entryPointPatterns, ...(parsed.entryPointPatterns ?? [])])],
    };
  } catch {
    return base;
  }
}

export function registerConfigCommands(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('depsview.openConfig', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('DepsView: No workspace folder open');
      return;
    }

    const configDir = path.join(workspaceFolder.uri.fsPath, '.depsview');
    const configPath = path.join(configDir, 'config.json');

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    }

    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc);
  });

  context.subscriptions.push(disposable);
}
