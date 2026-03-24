import type { DirectedGraph } from 'graphology';
import type { FileParseResult } from '../parser/types.js';
import type { GraphNodeData, GraphEdgeData, DetectionIssue, DetectionResult } from './types.js';

const ENTRY_PATTERNS = /(?:^|\/)(?:index|main|app|server)\.\w+$/i;

// Files that are never imported but are expected to exist
const ORPHAN_EXCLUDE_PATTERNS = new RegExp(
  '(?:' + [
    '\\.config\\.\\w+$',         // vite.config, eslint.config, etc.
    '\\.spec\\.\\w+$',           // test specs
    '\\.test\\.\\w+$',           // test files
    '\\.e2e\\.\\w+$',            // e2e tests
    '__tests__',                  // test directories
    '\\.stories\\.\\w+$',        // Storybook stories
    '\\.setup\\.\\w+$',          // jest.setup, vitest.setup
    'next-env\\.d\\.ts$',        // Next.js type declarations
    '(?:^|/)middleware\\.\\w+$',  // Next.js middleware
    '(?:^|/)layout\\.\\w+$',     // Next.js layouts
    '(?:^|/)page\\.\\w+$',       // Next.js pages
    '(?:^|/)loading\\.\\w+$',    // Next.js loading
    '(?:^|/)error\\.\\w+$',      // Next.js error
    '(?:^|/)not-found\\.\\w+$',  // Next.js not-found
    'global-error\\.\\w+$',      // Next.js global-error
    '(?:^|/)route\\.\\w+$',      // Next.js API routes
    '(?:^|/)template\\.\\w+$',   // Next.js templates
    '(?:^|/)_app\\.\\w+$',       // Next.js Pages Router _app
    '(?:^|/)_document\\.\\w+$',  // Next.js Pages Router _document
    '(?:^|/)default\\.\\w+$',    // Next.js parallel routes default
    '\\.d\\.ts$',                  // TypeScript declaration files
    '\\.worker\\.\\w+$',          // Web Worker files (loaded via new Worker())
  ].join('|') + ')',
  'i',
);

/**
 * Detect all cycles in the graph. Returns cycle paths and edges involved.
 */
function detectCycles(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
): { issues: DetectionIssue[]; cycleEdges: Array<{ source: string; target: string }> } {
  const issues: DetectionIssue[] = [];
  const cycleEdges: Array<{ source: string; target: string }> = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const foundCycles = new Set<string>(); // deduplicate cycles
  let cycleGroupCounter = 0;

  function dfs(nodeId: string, path: string[]): void {
    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    const successors = graph.outNeighbors(nodeId);
    for (const successor of successors) {
      if (inStack.has(successor)) {
        // Found a cycle - extract the cycle path
        const cycleStart = path.indexOf(successor);
        const cyclePath = path.slice(cycleStart);
        const cycleKey = [...cyclePath].sort().join('→');

        if (!foundCycles.has(cycleKey)) {
          foundCycles.add(cycleKey);
          const groupId = cycleGroupCounter++;
          issues.push({
            type: 'cycle',
            severity: 'critical',
            message: `Circular dependency: ${cyclePath.join(' → ')} → ${successor}`,
            filePaths: cyclePath,
            cycleGroup: groupId,
          });

          // Track cycle edges for visualization
          for (let i = 0; i < cyclePath.length; i++) {
            const src = cyclePath[i];
            const tgt = cyclePath[(i + 1) % cyclePath.length];
            cycleEdges.push({ source: src, target: tgt });
          }
        }
      } else if (!visited.has(successor)) {
        dfs(successor, path);
      }
    }

    path.pop();
    inStack.delete(nodeId);
  }

  graph.forEachNode(nodeId => {
    if (!visited.has(nodeId)) {
      dfs(nodeId, []);
    }
  });

  return { issues, cycleEdges };
}

/**
 * Detect phantom imports (imports pointing to non-existent files).
 */
// Non-JS/TS assets that are commonly imported but not in the scan set
const ASSET_EXTENSIONS = /\.(?:css|scss|sass|less|styl|svg|png|jpg|jpeg|gif|ico|woff2?|ttf|eot|json|graphql|gql|md)$/i;

function detectPhantoms(parseResults: FileParseResult[]): DetectionIssue[] {
  const issues: DetectionIssue[] = [];

  for (const result of parseResults) {
    for (const imp of result.imports) {
      // Only check relative imports (not bare specifiers like 'react')
      if (!imp.source.startsWith('.') && !imp.source.startsWith('/')) continue;
      if (imp.resolvedPath) continue;
      // Skip asset imports (CSS, images, fonts, etc.) — not JS/TS files
      if (ASSET_EXTENSIONS.test(imp.source)) continue;

      issues.push({
        type: 'phantom',
        severity: 'critical',
        message: `Phantom import: "${imp.source}" in ${result.filePath.split('/').pop()}`,
        filePaths: [result.filePath],
        line: imp.line,
      });
    }
  }

  return issues;
}

/**
 * Build a map of file → exported names (Shadow Export Map).
 * Also tracks files that re-export from external packages (can't validate).
 */
function buildExportMap(parseResults: FileParseResult[]): {
  exportMap: Map<string, Set<string>>;
  hasExternalReExports: Set<string>;
} {
  const exportMap = new Map<string, Set<string>>();
  const hasExternalReExports = new Set<string>();

  for (const result of parseResults) {
    const names = new Set<string>();

    for (const exp of result.exports) {
      if (exp.kind === 'default') {
        names.add('default');
      } else if (exp.kind === 'all') {
        names.add('*');
      } else {
        for (const spec of exp.specifiers) {
          names.add(spec.alias ?? spec.name);
        }
      }

      // Track files that re-export from external packages
      if (exp.source && !exp.source.startsWith('.') && !exp.source.startsWith('/')) {
        hasExternalReExports.add(result.filePath);
      }
    }

    exportMap.set(result.filePath, names);
  }

  return { exportMap, hasExternalReExports };
}

/**
 * Detect shadow imports (imports of non-existent named exports from existing files).
 * Lower severity than phantom (file not found) since re-exports may be untraceable.
 */
function detectShadowImports(
  parseResults: FileParseResult[],
  exportMap: Map<string, Set<string>>,
  hasExternalReExports: Set<string>,
): DetectionIssue[] {
  const issues: DetectionIssue[] = [];

  for (const result of parseResults) {
    for (const imp of result.imports) {
      if (!imp.resolvedPath) continue;
      if (imp.specifiers.length === 0) continue;
      if (imp.isTypeOnly) continue; // Type imports are often complex

      const targetExports = exportMap.get(imp.resolvedPath);
      if (!targetExports) continue;
      if (targetExports.has('*')) continue; // Barrel re-export
      if (hasExternalReExports.has(imp.resolvedPath)) continue; // Re-exports from node_modules

      for (const spec of imp.specifiers) {
        if (spec.isNamespace) continue;
        if (spec.isDefault) {
          if (!targetExports.has('default')) {
            issues.push({
              type: 'shadow',
              severity: 'warning',
              message: `Shadow import: default export not found in ${imp.resolvedPath.split('/').pop()}`,
              filePaths: [result.filePath, imp.resolvedPath],
              line: imp.line,
            });
          }
          continue;
        }
        const importedName = spec.name;
        if (!targetExports.has(importedName)) {
          issues.push({
            type: 'shadow',
            severity: 'warning',
            message: `Shadow import: "${importedName}" not exported by ${imp.resolvedPath.split('/').pop()}`,
            filePaths: [result.filePath, imp.resolvedPath],
            line: imp.line,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Build a set of files (absolute paths) that are re-exported by barrel files
 * (index.ts etc.) which themselves have importers.
 * These files are NOT orphans even if inDegree === 0.
 */
function buildBarrelCoveredFiles(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
  parseResults: FileParseResult[],
): Set<string> {
  const covered = new Set<string>();

  // Map absolute filePath → relative nodeId for graph lookups
  const absToNodeId = new Map<string, string>();
  graph.forEachNode((nodeId, data) => {
    absToNodeId.set(data.filePath, nodeId);
  });

  for (const result of parseResults) {
    // Check if this file has local re-exports (barrel pattern)
    const reExportTargets: string[] = [];
    for (const exp of result.exports) {
      if (exp.source && (exp.source.startsWith('.') || exp.source.startsWith('/'))) {
        // This file re-exports from a local file — find the resolved path
        for (const imp of result.imports) {
          if (imp.source === exp.source && imp.resolvedPath) {
            reExportTargets.push(imp.resolvedPath);
          }
        }
      }
    }

    if (reExportTargets.length === 0) continue;

    // This file is a barrel/re-exporter. Check if it has importers itself.
    const barrelNodeId = absToNodeId.get(result.filePath);
    const barrelHasImporters = barrelNodeId != null && graph.inDegree(barrelNodeId) > 0;
    // Also count as "has importers" if the barrel matches entry patterns (index.ts etc.)
    const barrelIsEntry = ENTRY_PATTERNS.test(result.filePath);

    if (barrelHasImporters || barrelIsEntry) {
      for (const target of reExportTargets) {
        covered.add(target);
      }
    }
  }

  return covered;
}

/**
 * Detect orphan files (no incoming edges, not entry points, not barrel-covered).
 */
function detectOrphans(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
  parseResults: FileParseResult[],
  customOrphanPatterns: string[] = [],
): DetectionIssue[] {
  const issues: DetectionIssue[] = [];
  const barrelCovered = buildBarrelCoveredFiles(graph, parseResults);
  const customRegex = customOrphanPatterns.length > 0
    ? new RegExp('(?:' + customOrphanPatterns.join('|') + ')', 'i')
    : null;

  graph.forEachNode((nodeId, data) => {
    if (graph.inDegree(nodeId) === 0
      && !ENTRY_PATTERNS.test(data.relativePath)
      && !ORPHAN_EXCLUDE_PATTERNS.test(data.relativePath)
      && !(customRegex && customRegex.test(data.relativePath))
      && !barrelCovered.has(data.filePath)) {
      issues.push({
        type: 'orphan',
        severity: 'warning',
        message: `Orphaned file: ${data.relativePath} (not imported by any file)`,
        filePaths: [data.relativePath],
      });
    }
  });

  return issues;
}

/**
 * Detect excessive coupling (nodes with too many connections).
 */
function detectCoupling(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
  threshold: number = 8,
): DetectionIssue[] {
  const issues: DetectionIssue[] = [];

  graph.forEachNode((nodeId, data) => {
    const totalDegree = graph.inDegree(nodeId) + graph.outDegree(nodeId);
    if (totalDegree > threshold) {
      issues.push({
        type: 'coupling',
        severity: 'warning',
        message: `Excessive coupling: ${data.relativePath} (${graph.inDegree(nodeId)} in, ${graph.outDegree(nodeId)} out)`,
        filePaths: [data.relativePath],
      });
    }
  });

  return issues;
}

/**
 * Compute a health score from 0 to 100 based on detected issues.
 * Penalties are capped per category to prevent a single issue type from dominating.
 */
function computeHealthScore(issues: DetectionIssue[]): number {
  // Count per type
  const counts = { cycle: 0, phantom: 0, shadow: 0, orphan: 0, coupling: 0 };
  for (const issue of issues) {
    counts[issue.type] = (counts[issue.type] ?? 0) + 1;
  }

  let score = 100;
  // Cycles: -15 each, cap -45 (3 cycles = max penalty)
  score -= Math.min(counts.cycle * 15, 45);
  // Phantoms: -10 each, cap -30
  score -= Math.min(counts.phantom * 10, 30);
  // Shadow: -3 each, cap -15
  score -= Math.min(counts.shadow * 3, 15);
  // Orphans: -1 each, cap -15
  score -= Math.min(counts.orphan * 1, 15);
  // Coupling: -5 each, cap -15
  score -= Math.min(counts.coupling * 5, 15);

  return Math.max(0, score);
}

/**
 * Run all detections on the graph and parse results.
 */
export function analyze(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
  parseResults: FileParseResult[],
  couplingThreshold: number = 8,
  customOrphanPatterns: string[] = [],
): DetectionResult {
  const cycleResult = detectCycles(graph);
  const phantoms = detectPhantoms(parseResults);
  const { exportMap, hasExternalReExports } = buildExportMap(parseResults);
  const shadowImports = detectShadowImports(parseResults, exportMap, hasExternalReExports);
  const orphans = detectOrphans(graph, parseResults, customOrphanPatterns);
  const coupling = detectCoupling(graph, couplingThreshold);

  // Large projects (monorepos): orphans are less meaningful because cross-package
  // imports are not resolved. Downgrade orphans to 'info' severity.
  const isLargeProject = graph.order > 500;
  if (isLargeProject) {
    for (const o of orphans) o.severity = 'info';
  }

  const allIssues = [
    ...cycleResult.issues,
    ...phantoms,
    ...shadowImports,
    ...orphans,
    ...coupling,
  ];

  return {
    issues: allIssues,
    cycleEdges: cycleResult.cycleEdges,
    healthScore: computeHealthScore(allIssues),
  };
}
