import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { setGrammarDir } from '../parser/treeSitter.js';
import { scanProject } from '../parser/scanner.js';
import { buildDependencyGraph } from '../graph/builder.js';
import { serializeGraph } from '../graph/serializer.js';
import { analyze } from '../graph/analyzer.js';
import { computeAllImpactScores } from '../graph/impact.js';
import { generateReport } from '../bridge/generator.js';
import { buildFixPrompt } from '../bridge/promptBuilder.js';
import { loadConfig } from './configPanel.js';
import type { DetectionIssue, ScanResult } from '../graph/types.js';

let lastScanResult: ScanResult | undefined;
let lastIssues: DetectionIssue[] | undefined;
let lastImpactScores: Map<string, number> | undefined;

export function getLastScanData() {
  return { scanResult: lastScanResult, issues: lastIssues, impactScores: lastImpactScores };
}

async function runFullAnalysis(rootDir: string, context: vscode.ExtensionContext) {
  const grammarDir = path.join(context.extensionPath, 'dist', 'grammars');
  setGrammarDir(grammarDir);

  const results = await scanProject(rootDir);
  const graph = buildDependencyGraph(results, rootDir);
  lastScanResult = serializeGraph(graph, rootDir);
  const config = loadConfig(rootDir);
  const detection = analyze(graph, results, config.couplingThreshold, config.entryPointPatterns);
  lastIssues = detection.issues;
  lastImpactScores = computeAllImpactScores(graph);

  return { scanResult: lastScanResult, detection, impactScores: lastImpactScores };
}

export function registerBridgeCommands(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('depsview.generateReport', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('DepsView: No workspace folder open');
      return;
    }

    const rootDir = workspaceFolder.uri.fsPath;
    const { scanResult, detection, impactScores } = await runFullAnalysis(rootDir, context);

    const md = generateReport(scanResult, detection, impactScores);
    const outputPath = path.join(rootDir, '.depsview-check.md');
    fs.writeFileSync(outputPath, md, 'utf-8');

    const doc = await vscode.workspace.openTextDocument(outputPath);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`DepsView: Health report generated at .depsview-check.md (${detection.healthScore}/100)`);
  });

  context.subscriptions.push(disposable);
}

export function handleCopyPrompt(issueIndex: number): void {
  const { scanResult, issues, impactScores } = getLastScanData();
  if (!scanResult || !issues || !impactScores) {
    vscode.window.showWarningMessage('DepsView: Run a scan first');
    return;
  }

  const issue = issues[issueIndex];
  if (!issue) {
    vscode.window.showWarningMessage('DepsView: Issue not found');
    return;
  }

  const prompt = buildFixPrompt(issue, scanResult, impactScores);
  vscode.env.clipboard.writeText(prompt);
  vscode.window.showInformationMessage('DepsView: Fix prompt copied to clipboard');
}
