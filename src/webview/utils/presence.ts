import type { Edge } from '@xyflow/react';
import type { WebviewEdgeData } from '../../shared/protocol.js';

/**
 * Compute BFS distances from a source node (bidirectional: follows imports and importers).
 * Returns Map<nodeId, depth> for all reachable nodes within maxDepth.
 */
export function computeBfsDistances(
  sourceId: string,
  edges: Edge<WebviewEdgeData>[],
  maxDepth: number = 4,
): Map<string, number> {
  const distances = new Map<string, number>();
  distances.set(sourceId, 0);

  let current = [sourceId];
  const visited = new Set<string>([sourceId]);

  // Build bidirectional adjacency
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    let neighbors = adj.get(edge.source);
    if (!neighbors) { neighbors = []; adj.set(edge.source, neighbors); }
    neighbors.push(edge.target);

    let rNeighbors = adj.get(edge.target);
    if (!rNeighbors) { rNeighbors = []; adj.set(edge.target, rNeighbors); }
    rNeighbors.push(edge.source);
  }

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: string[] = [];
    for (const nodeId of current) {
      const neighbors = adj.get(nodeId);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          distances.set(neighbor, depth);
          next.push(neighbor);
        }
      }
    }
    if (next.length === 0) break;
    current = next;
  }

  return distances;
}

/**
 * Compute the presence score for a file (0.0 to 1.0).
 *
 * Formula: 0.5 * proximity + 0.3 * heat + 0.2 * structuralWeight
 */
export function computePresence(
  bfsDepth: number | undefined,
  lastModifiedMs: number,
  importCount: number,
  exportCount: number,
  maxDegree: number,
  nowMs: number = Date.now(),
): number {
  // Proximity (weight 0.5) — BFS distance from active/selected file
  let proximity: number;
  if (bfsDepth === undefined) {
    proximity = 0.5; // No active file — neutral
  } else if (bfsDepth === 0) {
    proximity = 1.0;
  } else if (bfsDepth === 1) {
    proximity = 0.7;
  } else if (bfsDepth === 2) {
    proximity = 0.4;
  } else {
    proximity = 0.1;
  }

  // Heat (weight 0.3) — step function based on modification recency
  const ageMinutes = (nowMs - lastModifiedMs) / 60_000;
  const heat = ageMinutes < 2 ? 1.0
    : ageMinutes < 10 ? 0.6
    : ageMinutes < 60 ? 0.3
    : 0.05;

  // Structural weight (weight 0.2) — normalized degree
  const degree = importCount + exportCount;
  const structuralWeight = maxDegree > 0 ? degree / maxDegree : 0;

  return 0.5 * proximity + 0.3 * heat + 0.2 * structuralWeight;
}
