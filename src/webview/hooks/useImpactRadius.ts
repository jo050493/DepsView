import { useState, useCallback, useMemo, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { WebviewNodeData, WebviewEdgeData } from '../../shared/protocol.js';

export interface ImpactState {
  hoveredNode: string | null;
  impactLevels: Map<string, number>; // nodeId → level (1, 2, 3)
}

/**
 * Compute impact radius client-side from the graph edges.
 * BFS via predecessors (who depends on the hovered node?).
 */
function computeClientImpact(
  nodeId: string,
  edges: Edge<WebviewEdgeData>[],
  maxDepth: number = 3,
): Map<string, number> {
  const levels = new Map<string, number>();
  const visited = new Set<string>([nodeId]);
  let currentLevel = [nodeId];

  // Build reverse adjacency (target → sources)
  const reverseAdj = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = reverseAdj.get(edge.target) ?? [];
    targets.push(edge.source);
    reverseAdj.set(edge.target, targets);
  }

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextLevel: string[] = [];
    for (const current of currentLevel) {
      const predecessors = reverseAdj.get(current) ?? [];
      for (const pred of predecessors) {
        if (!visited.has(pred)) {
          visited.add(pred);
          nextLevel.push(pred);
          levels.set(pred, depth);
        }
      }
    }
    if (nextLevel.length === 0) break;
    currentLevel = nextLevel;
  }

  return levels;
}

export function useImpactRadius(edges: Edge<WebviewEdgeData>[]): {
  impactState: ImpactState;
  onNodeHover: (nodeId: string | null) => void;
} {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const impactLevels = useMemo(() => {
    if (!hoveredNode) return new Map<string, number>();
    return computeClientImpact(hoveredNode, edges);
  }, [hoveredNode, edges]);

  const hoveredRef = useRef<string | null>(null);
  const onNodeHover = useCallback((nodeId: string | null) => {
    if (hoveredRef.current === nodeId) return;
    hoveredRef.current = nodeId;
    setHoveredNode(nodeId);
  }, []);

  return {
    impactState: { hoveredNode, impactLevels },
    onNodeHover,
  };
}
