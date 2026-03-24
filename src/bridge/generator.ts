import * as path from 'path';
import type { ScanResult, DetectionResult } from '../graph/types.js';

function healthEmoji(score: number): string {
  if (score >= 80) return 'GREEN';
  if (score >= 50) return 'ORANGE';
  return 'RED';
}

function formatAge(ms: number): string {
  const now = Date.now();
  const days = Math.floor((now - ms) / (24 * 60 * 60 * 1000));
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/**
 * Build adjacency list: compact format grouping dependencies per source file.
 * Format: `src/auth/login.ts → [api.ts, types.ts, store.ts]`
 * ~60% fewer tokens than prose description.
 */
function buildAdjacencyList(scanResult: ScanResult): string {
  // Build adjacency map: source → target filenames
  const adj = new Map<string, string[]>();

  for (const edge of scanResult.edges) {
    const targets = adj.get(edge.source) ?? [];
    // Use short filename (just the basename) if target is in a different folder
    const sourceDir = path.dirname(edge.source);
    const targetDir = path.dirname(edge.target);
    const targetName = sourceDir === targetDir
      ? path.basename(edge.target)
      : edge.target;
    targets.push(targetName);
    adj.set(edge.source, targets);
  }

  // Sort by source path, group by folder
  const sorted = [...adj.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const lines: string[] = [];
  let currentFolder = '';

  for (const [source, targets] of sorted) {
    const folder = path.dirname(source);
    if (folder !== currentFolder) {
      if (lines.length > 0) lines.push('');
      currentFolder = folder;
    }
    lines.push(`${source} → [${targets.join(', ')}]`);
  }

  return lines.join('\n');
}

function buildFolderSummary(scanResult: ScanResult): string {
  const folders = new Map<string, { files: number; depsOut: number; dependsOn: Set<string> }>();

  for (const node of scanResult.nodes) {
    const folder = path.dirname(node.data.relativePath).replace(/\\/g, '/');
    const entry = folders.get(folder) ?? { files: 0, depsOut: 0, dependsOn: new Set<string>() };
    entry.files++;
    folders.set(folder, entry);
  }

  for (const edge of scanResult.edges) {
    const sourceFolder = path.dirname(edge.source).replace(/\\/g, '/');
    const targetFolder = path.dirname(edge.target).replace(/\\/g, '/');
    const entry = folders.get(sourceFolder);
    if (entry) {
      entry.depsOut++;
      if (sourceFolder !== targetFolder) {
        entry.dependsOn.add(targetFolder);
      }
    }
  }

  const lines: string[] = [];
  const sortedFolders = [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  for (const [folder, data] of sortedFolders) {
    lines.push(`${folder}/ (${data.files} files, ${data.depsOut} deps out)`);
    if (data.dependsOn.size > 0) {
      lines.push(`  depends on: ${[...data.dependsOn].join(', ')}`);
    }
  }

  return lines.join('\n');
}

export function generateReport(
  scanResult: ScanResult,
  detectionResult: DetectionResult,
  impactScores: Map<string, number>,
): string {
  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').slice(0, 16);

  const cycleCount = detectionResult.issues.filter(i => i.type === 'cycle').length;
  const phantomCount = detectionResult.issues.filter(i => i.type === 'phantom').length;
  const orphanCount = detectionResult.issues.filter(i => i.type === 'orphan').length;
  const couplingCount = detectionResult.issues.filter(i => i.type === 'coupling').length;

  const criticalIssues = detectionResult.issues.filter(i => i.severity === 'critical');
  const warningIssues = detectionResult.issues.filter(i => i.severity === 'warning');

  const lines: string[] = [];

  // Header
  lines.push('# DepsView — Architectural Diagnostic');
  lines.push(`## Generated ${dateStr}`);
  lines.push('');

  // Metrics
  lines.push('## Metrics');
  lines.push(`- Files: ${scanResult.stats.fileCount} | Health: ${detectionResult.healthScore}/100 (${healthEmoji(detectionResult.healthScore)})`);
  lines.push(`- Cycles: ${cycleCount} | Phantoms: ${phantomCount} | Orphans: ${orphanCount} | Coupling: ${couplingCount}`);
  lines.push('');

  // Critical issues
  if (criticalIssues.length > 0) {
    lines.push('## Critical Issues');
    lines.push('');
    for (let i = 0; i < criticalIssues.length; i++) {
      const issue = criticalIssues[i];
      lines.push(`### ${issue.type.charAt(0).toUpperCase() + issue.type.slice(1)} #${i + 1}`);
      lines.push(issue.message);

      // Add impact info for cycle/phantom
      if (issue.filePaths.length > 0) {
        const maxImpact = Math.max(...issue.filePaths.map(fp => impactScores.get(fp) ?? 0));
        if (maxImpact > 0) {
          lines.push(`Impact: ${maxImpact} files affected`);
        }
      }
      lines.push('');
    }
  }

  // Warnings
  if (warningIssues.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const issue of warningIssues) {
      lines.push(`- ${issue.message}`);
    }
    lines.push('');
  }

  // Adjacency list (compact, token-optimized for LLM context)
  lines.push('## Dependencies (Adjacency List)');
  lines.push('```');
  lines.push(buildAdjacencyList(scanResult));
  lines.push('```');
  lines.push('');

  // Folder summary
  lines.push('## Folder Summary');
  lines.push('```');
  lines.push(buildFolderSummary(scanResult));
  lines.push('```');
  lines.push('');

  // Top impact files
  const topImpact = [...impactScores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topImpact.length > 0) {
    lines.push('## High-Impact Files');
    for (const [file, score] of topImpact) {
      lines.push(`- ${file} (affects ${score} files)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export { buildAdjacencyList, buildFolderSummary };
