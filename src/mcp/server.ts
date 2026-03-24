import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as path from 'path';
import * as fs from 'fs';
import { z } from 'zod';
import { setGrammarDir } from '../parser/treeSitter.js';
import { scanProject } from '../parser/scanner.js';
import { buildDependencyGraph } from '../graph/builder.js';
import { serializeGraph } from '../graph/serializer.js';
import { analyze } from '../graph/analyzer.js';
import { computeAllImpactScores, computeImpactRadius } from '../graph/impact.js';
import type { DirectedGraph } from 'graphology';
import type { GraphNodeData, GraphEdgeData, ScanResult, DetectionResult } from '../graph/types.js';
import type { FileParseResult } from '../parser/types.js';

// Cached state after scan
let graph: DirectedGraph<GraphNodeData, GraphEdgeData>;
let scanResult: ScanResult;
let detection: DetectionResult;
let impactScores: Map<string, number>;
let parseResults: FileParseResult[];
let projectRoot: string;

async function initProject(dir: string): Promise<void> {
  projectRoot = path.resolve(dir);
  if (!fs.existsSync(projectRoot)) {
    throw new Error(`Directory not found: ${projectRoot}`);
  }

  // Set grammar dir relative to this script
  const grammarDir = path.join(__dirname, 'grammars');
  if (fs.existsSync(grammarDir)) {
    setGrammarDir(grammarDir);
  }

  parseResults = await scanProject(projectRoot);
  graph = buildDependencyGraph(parseResults, projectRoot);
  scanResult = serializeGraph(graph, projectRoot);
  detection = analyze(graph, parseResults);
  impactScores = computeAllImpactScores(graph);
}

export async function startMcpServer(dir: string): Promise<void> {
  const server = new McpServer({
    name: 'depsview',
    version: '0.2.0',
  });

  // ── Tool 1: get_architecture_summary ──
  server.tool(
    'get_architecture_summary',
    'Get an overview of the project architecture: file count, dependency count, health score, detection counts, and top high-impact files.',
    async () => {
      await ensureScanned(dir);

      const cycleCount = detection.issues.filter(i => i.type === 'cycle').length;
      const phantomCount = detection.issues.filter(i => i.type === 'phantom').length;
      const shadowCount = detection.issues.filter(i => i.type === 'shadow').length;
      const orphanCount = detection.issues.filter(i => i.type === 'orphan').length;
      const couplingCount = detection.issues.filter(i => i.type === 'coupling').length;

      const topImpact = [...impactScores.entries()]
        .filter(([, score]) => score > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            project: projectRoot,
            files: scanResult.stats.fileCount,
            dependencies: scanResult.stats.edgeCount,
            healthScore: detection.healthScore,
            detections: {
              cycles: cycleCount,
              phantoms: phantomCount,
              shadows: shadowCount,
              orphans: orphanCount,
              coupling: couplingCount,
              total: detection.issues.length,
            },
            highImpactFiles: topImpact.map(([file, score]) => ({
              file,
              affectedFiles: score,
            })),
          }, null, 2),
        }],
      };
    },
  );

  // ── Tool 2: get_file_dependencies ──
  server.tool(
    'get_file_dependencies',
    'Get imports, dependents, and impact radius for a specific file. Use relative path from project root.',
    { filePath: z.string().describe('Relative path from project root (e.g. "src/utils/auth.ts")') },
    async ({ filePath }) => {
      await ensureScanned(dir);

      const nodeId = filePath.replace(/\\/g, '/');
      if (!graph.hasNode(nodeId)) {
        return {
          content: [{ type: 'text' as const, text: `File not found in graph: ${nodeId}` }],
          isError: true,
        };
      }

      // What this file imports
      const imports = graph.outNeighbors(nodeId).map(target => {
        const edgeKey = graph.edge(nodeId, target);
        const edgeData = edgeKey ? graph.getEdgeAttributes(edgeKey) : null;
        return {
          file: target,
          specifiers: edgeData?.specifiers ?? [],
          kind: edgeData?.kind ?? 'static',
        };
      });

      // What imports this file
      const dependents = graph.inNeighbors(nodeId).map(source => {
        const edgeKey = graph.edge(source, nodeId);
        const edgeData = edgeKey ? graph.getEdgeAttributes(edgeKey) : null;
        return {
          file: source,
          specifiers: edgeData?.specifiers ?? [],
        };
      });

      const impact = computeImpactRadius(graph, nodeId);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            file: nodeId,
            imports,
            dependents,
            impact: {
              totalAffected: impact.totalAffected,
              levels: impact.levels.map(l => ({
                depth: l.level,
                files: l.nodeIds,
              })),
            },
          }, null, 2),
        }],
      };
    },
  );

  // ── Tool 3: get_detections ──
  server.tool(
    'get_detections',
    'Get architectural issues detected in the project: cycles, phantom imports, shadow imports, orphans, coupling. Optionally filter by type.',
    {
      type: z.enum(['cycle', 'phantom', 'shadow', 'orphan', 'coupling']).optional()
        .describe('Filter by issue type. Omit to get all detections.'),
    },
    async ({ type }) => {
      await ensureScanned(dir);

      const issues = type
        ? detection.issues.filter(i => i.type === type)
        : detection.issues;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            total: issues.length,
            healthScore: detection.healthScore,
            issues: issues.map(i => ({
              type: i.type,
              severity: i.severity,
              message: i.message,
              files: i.filePaths,
              ...(i.line !== undefined ? { line: i.line } : {}),
            })),
          }, null, 2),
        }],
      };
    },
  );

  // ── Tool 4: get_impact_radius ──
  server.tool(
    'get_impact_radius',
    'Compute the cascade impact of modifying a file: which files would be affected, grouped by depth level.',
    {
      filePath: z.string().describe('Relative path from project root'),
      maxDepth: z.number().optional().default(5).describe('Max BFS depth (default: 5)'),
    },
    async ({ filePath, maxDepth }) => {
      await ensureScanned(dir);

      const nodeId = filePath.replace(/\\/g, '/');
      if (!graph.hasNode(nodeId)) {
        return {
          content: [{ type: 'text' as const, text: `File not found in graph: ${nodeId}` }],
          isError: true,
        };
      }

      const impact = computeImpactRadius(graph, nodeId, maxDepth);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            sourceFile: nodeId,
            totalAffected: impact.totalAffected,
            levels: impact.levels.map(l => ({
              depth: l.level,
              count: l.nodeIds.length,
              files: l.nodeIds,
            })),
          }, null, 2),
        }],
      };
    },
  );

  // ── Tool 5: get_coupling_analysis ──
  server.tool(
    'get_coupling_analysis',
    'Analyze cross-folder coupling: which folder pairs have the most dependencies between them, sorted by coupling strength.',
    async () => {
      await ensureScanned(dir);

      const folderPairs = new Map<string, number>();

      for (const edge of scanResult.edges) {
        const sourceFolder = path.dirname(edge.source).replace(/\\/g, '/');
        const targetFolder = path.dirname(edge.target).replace(/\\/g, '/');
        if (sourceFolder === targetFolder) continue;

        const key = [sourceFolder, targetFolder].sort().join(' <-> ');
        folderPairs.set(key, (folderPairs.get(key) ?? 0) + 1);
      }

      const sorted = [...folderPairs.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            crossFolderCoupling: sorted.map(([pair, count]) => {
              const [folderA, folderB] = pair.split(' <-> ');
              return { folderA, folderB, dependencyCount: count };
            }),
          }, null, 2),
        }],
      };
    },
  );

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function ensureScanned(dir: string): Promise<void> {
  if (!graph) {
    await initProject(dir);
  }
}
