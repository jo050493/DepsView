import type { DirectedGraph } from 'graphology';
import { hasCycle } from 'graphology-dag';
import type { GraphNodeData, GraphEdgeData, ScanResult } from './types.js';
import type { DetectionResult } from './types.js';

/**
 * Serialize graph to a ScanResult.
 * If detectionResult is provided, use its orphan count (which applies exclusion patterns).
 */
export function serializeGraph(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
  rootDir: string,
  detectionResult?: DetectionResult,
): ScanResult {
  const nodes: ScanResult['nodes'] = [];
  const edges: ScanResult['edges'] = [];

  graph.forEachNode((id, data) => {
    nodes.push({ id, data });
  });

  graph.forEachEdge((_edge, data, source, target) => {
    edges.push({ source, target, data });
  });

  // Use detection result orphan count if available (respects exclusion patterns),
  // otherwise fall back to raw degree-0 count
  let orphanCount: number;
  if (detectionResult) {
    orphanCount = detectionResult.issues.filter(i => i.type === 'orphan').length;
  } else {
    orphanCount = 0;
    graph.forEachNode((id) => {
      if (graph.degree(id) === 0) orphanCount++;
    });
  }

  return {
    root: rootDir,
    nodes,
    edges,
    stats: {
      fileCount: graph.order,
      edgeCount: graph.size,
      orphanCount,
      hasCycles: hasCycle(graph),
    },
  };
}
