import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem | undefined;

export function createStatusBar(): vscode.StatusBarItem {
  if (statusBarItem) return statusBarItem;

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'depsview.showGraph';
  statusBarItem.tooltip = 'DepsView: Click to show dependency graph';
  statusBarItem.text = '$(pulse) DepsView';
  statusBarItem.show();

  return statusBarItem;
}

export function updateHealthScore(score: number, issueCount: number): void {
  if (!statusBarItem) return;

  let icon: string;
  let color: string;
  if (score >= 80) {
    icon = '$(check)';
    color = '#22C55E';
  } else if (score >= 50) {
    icon = '$(warning)';
    color = '#F59E0B';
  } else {
    icon = '$(error)';
    color = '#EF4444';
  }

  const issueLabel = issueCount > 0 ? ` · ${issueCount} issue${issueCount > 1 ? 's' : ''}` : '';
  statusBarItem.text = `${icon} ${score}/100${issueLabel}`;
  statusBarItem.color = color;
  statusBarItem.tooltip = `DepsView: Health ${score}/100 | ${issueCount} issue${issueCount !== 1 ? 's' : ''}\nClick to open dependency graph`;
}
