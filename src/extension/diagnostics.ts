import * as vscode from 'vscode';
import type { DetectionIssue, IssueType } from '../graph/types.js';

let diagnosticCollection: vscode.DiagnosticCollection | undefined;

type DiagLevel = 'error' | 'warning' | 'hint' | 'off';

export function createDiagnostics(context: vscode.ExtensionContext): void {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('depsview');
  context.subscriptions.push(diagnosticCollection);
}

export function updateDiagnostics(issues: DetectionIssue[], rootDir: string): void {
  if (!diagnosticCollection) return;
  diagnosticCollection.clear();

  const config = getDiagConfig();
  const byFile = new Map<string, vscode.Diagnostic[]>();

  for (const issue of issues) {
    const level = config[issue.type] ?? 'warning';
    if (level === 'off') continue;

    const severity = mapLevel(level);
    const message = formatMessage(issue);

    for (const fp of issue.filePaths) {
      const absPath = fp.startsWith('/') || fp.includes(':') ? fp : `${rootDir}/${fp}`;
      const uri = vscode.Uri.file(absPath);
      const key = uri.fsPath;

      const line = Math.max((issue.line ?? 1) - 1, 0);
      const range = new vscode.Range(line, 0, line, 200);

      const diag = new vscode.Diagnostic(range, message, severity);
      diag.source = 'DepsView';
      diag.code = issue.type;

      if (!byFile.has(key)) byFile.set(key, []);
      byFile.get(key)!.push(diag);
    }
  }

  for (const [filePath, diags] of byFile) {
    diagnosticCollection.set(vscode.Uri.file(filePath), diags);
  }
}

export function clearDiagnostics(): void {
  diagnosticCollection?.clear();
}

function getDiagConfig(): Record<IssueType, DiagLevel> {
  const defaults: Record<IssueType, DiagLevel> = {
    orphan: 'hint',
    cycle: 'error',
    phantom: 'error',
    shadow: 'warning',
    coupling: 'hint',
  };
  const userConfig = vscode.workspace.getConfiguration('depsview').get<Record<string, string>>('diagnostics');
  if (!userConfig) return defaults;
  for (const [key, val] of Object.entries(userConfig)) {
    if (key in defaults && ['error', 'warning', 'hint', 'off'].includes(val)) {
      defaults[key as IssueType] = val as DiagLevel;
    }
  }
  return defaults;
}

function mapLevel(level: DiagLevel): vscode.DiagnosticSeverity {
  switch (level) {
    case 'error': return vscode.DiagnosticSeverity.Error;
    case 'warning': return vscode.DiagnosticSeverity.Warning;
    case 'hint': return vscode.DiagnosticSeverity.Hint;
    default: return vscode.DiagnosticSeverity.Information;
  }
}

function formatMessage(issue: DetectionIssue): string {
  switch (issue.type) {
    case 'cycle':
      return `Circular dependency: ${issue.filePaths.map(f => f.split('/').pop()).join(' \u2192 ')}`;
    case 'phantom':
      return `Import points to non-existent file`;
    case 'shadow':
      return `Import of non-existent export`;
    case 'orphan':
      return `Orphaned file \u2014 no other file imports this module`;
    case 'coupling':
      return issue.message || `High coupling detected`;
    default:
      return issue.message;
  }
}
