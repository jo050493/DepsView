import type { DirectedGraph } from 'graphology';
import type { GraphNodeData, GraphEdgeData, ImpactLevel, ImpactData } from './types.js';
import type { ImpactLevels } from '../shared/protocol.js';

/**
 * Compute impact radius via reverse BFS (who depends on me?).
 * Returns nodes grouped by distance level.
 */
export function computeImpactRadius(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
  nodeId: string,
  maxDepth: number = 10,
): ImpactData {
  if (!graph.hasNode(nodeId)) {
    return { sourceNode: nodeId, levels: [], totalAffected: 0 };
  }

  const visited = new Set<string>([nodeId]);
  const levels: ImpactLevel[] = [];
  let currentLevel = [nodeId];

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextLevel: string[] = [];

    for (const current of currentLevel) {
      // Reverse: who imports me? → predecessors (inbound edges)
      const predecessors = graph.inNeighbors(current);
      for (const pred of predecessors) {
        if (!visited.has(pred)) {
          visited.add(pred);
          nextLevel.push(pred);
        }
      }
    }

    if (nextLevel.length === 0) break;

    levels.push({ level: depth, nodeIds: nextLevel });
    currentLevel = nextLevel;
  }

  const totalAffected = levels.reduce((sum, l) => sum + l.nodeIds.length, 0);

  return {
    sourceNode: nodeId,
    levels,
    totalAffected,
  };
}

/**
 * Compute impact score for a single node (total affected files).
 */
export function computeImpactScore(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
  nodeId: string,
): number {
  return computeImpactRadius(graph, nodeId).totalAffected;
}

/**
 * Compute impact scores for all nodes in the graph.
 */
export function computeAllImpactScores(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
): Map<string, number> {
  const scores = new Map<string, number>();

  graph.forEachNode(nodeId => {
    scores.set(nodeId, computeImpactScore(graph, nodeId));
  });

  return scores;
}

/**
 * Compute impact levels (direct/indirect/far) for all nodes.
 * Used for concentric circle visualization on hover.
 */
export function computeAllImpactLevels(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
): Map<string, ImpactLevels> {
  const levels = new Map<string, ImpactLevels>();

  graph.forEachNode(nodeId => {
    const impact = computeImpactRadius(graph, nodeId, 3);
    const direct = impact.levels.find(l => l.level === 1)?.nodeIds.length ?? 0;
    const indirect = impact.levels.find(l => l.level === 2)?.nodeIds.length ?? 0;
    const far = impact.levels.find(l => l.level === 3)?.nodeIds.length ?? 0;

    if (direct > 0 || indirect > 0 || far > 0) {
      levels.set(nodeId, { direct, indirect, far });
    }
  });

  return levels;
}

/**
 * Compute both impact scores and levels in a single pass.
 * Saves ~50% time vs calling computeAllImpactScores + computeAllImpactLevels separately
 * because each node's BFS is only run once (with maxDepth=10 for score, extracting levels from depth 1-3).
 */
export function computeAllImpact(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
): { scores: Map<string, number>; levels: Map<string, ImpactLevels> } {
  const scores = new Map<string, number>();
  const levels = new Map<string, ImpactLevels>();

  graph.forEachNode(nodeId => {
    const impact = computeImpactRadius(graph, nodeId);
    scores.set(nodeId, impact.totalAffected);

    const direct = impact.levels.find(l => l.level === 1)?.nodeIds.length ?? 0;
    const indirect = impact.levels.find(l => l.level === 2)?.nodeIds.length ?? 0;
    const far = impact.levels.find(l => l.level === 3)?.nodeIds.length ?? 0;

    if (direct > 0 || indirect > 0 || far > 0) {
      levels.set(nodeId, { direct, indirect, far });
    }
  });

  return { scores, levels };
}

/**
 * Selective recomputation: update impact scores and levels
 * only for a set of affected nodes (and their BFS neighbors).
 */
export function recomputeImpactForNodes(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
  affectedNodes: string[],
  existingScores: Map<string, number>,
  existingLevels: Map<string, ImpactLevels>,
): { scores: Map<string, number>; levels: Map<string, ImpactLevels> } {
  // Collect all nodes that need recomputation: affected + their BFS-1 neighbors
  const toRecompute = new Set<string>(affectedNodes);
  for (const nodeId of affectedNodes) {
    if (!graph.hasNode(nodeId)) continue;
    for (const neighbor of graph.neighbors(nodeId)) {
      toRecompute.add(neighbor);
    }
  }

  // Clone existing maps and update only the affected nodes
  const scores = new Map(existingScores);
  const levels = new Map(existingLevels);

  for (const nodeId of toRecompute) {
    if (!graph.hasNode(nodeId)) {
      scores.delete(nodeId);
      levels.delete(nodeId);
      continue;
    }

    scores.set(nodeId, computeImpactScore(graph, nodeId));

    const impact = computeImpactRadius(graph, nodeId, 3);
    const direct = impact.levels.find(l => l.level === 1)?.nodeIds.length ?? 0;
    const indirect = impact.levels.find(l => l.level === 2)?.nodeIds.length ?? 0;
    const far = impact.levels.find(l => l.level === 3)?.nodeIds.length ?? 0;

    if (direct > 0 || indirect > 0 || far > 0) {
      levels.set(nodeId, { direct, indirect, far });
    } else {
      levels.delete(nodeId);
    }
  }

  return { scores, levels };
}
