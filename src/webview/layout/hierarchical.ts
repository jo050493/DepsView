import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { WebviewNodeData } from '../../shared/protocol.js';

export function computeHierarchicalLayout<N, E>(
  nodes: Node<N>[],
  edges: Edge<E>[],
  viewport?: { width: number; height: number },
): Node<N>[] {
  const g = new dagre.graphlib.Graph({ compound: true });

  const vw = viewport?.width ?? 1000;
  const vh = viewport?.height ?? 700;
  const n = nodes.length;

  // Aggressive compaction: smaller nodes and tighter spacing for large projects
  const nodeW = n > 200 ? 80 : n > 100 ? 90 : n > 50 ? 100 : 120;
  const nodeH = n > 200 ? 60 : n > 100 ? 70 : n > 50 ? 80 : 90;
  const nodesep = n > 200 ? 15 : n > 100 ? 20 : n > 50 ? 30 : 40;
  const ranksep = n > 200 ? 25 : n > 100 ? 35 : n > 50 ? 50 : 70;

  // LR for large projects (avoids tall narrow layouts), TB for small
  const rankdir = n > 80 ? 'LR' : (vw > vh * 1.3 ? 'LR' : 'TB');

  const marginx = Math.max(10, Math.round(vw * 0.02));
  const marginy = Math.max(10, Math.round(vh * 0.02));

  g.setGraph({ rankdir, nodesep, ranksep, marginx, marginy });
  g.setDefaultEdgeLabel(() => ({}));

  // Compound layout only for small projects — large projects use flat nodes
  const useCompound = n <= 80;

  // Per-node size scaling based on impact score (hub files get more room)
  const nodeSizeFor = (data: WebviewNodeData | undefined) => {
    const impact = data?.impactScore ?? 0;
    const scale = impact >= 5 ? 1.25 : impact >= 2 ? 1.12 : 1;
    return { w: Math.round(nodeW * scale), h: Math.round(nodeH * scale) };
  };

  if (useCompound) {
    const folders = new Set<string>();
    for (const node of nodes) {
      const data = node.data as WebviewNodeData;
      if (data?.folder) folders.add(data.folder);
    }
    for (const folder of folders) {
      g.setNode(`folder:${folder}`, { label: folder });
    }
    for (const node of nodes) {
      const data = node.data as WebviewNodeData;
      const { w, h } = nodeSizeFor(data);
      g.setNode(node.id, { width: w, height: h });
      if (data?.folder && folders.has(data.folder)) {
        g.setParent(node.id, `folder:${data.folder}`);
      }
    }
  } else {
    for (const node of nodes) {
      const data = node.data as WebviewNodeData;
      const { w, h } = nodeSizeFor(data);
      g.setNode(node.id, { width: w, height: h });
    }
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positioned = nodes.map(node => {
    const pos = g.node(node.id);
    if (!pos) return node;
    const data = node.data as WebviewNodeData;
    const { w, h } = nodeSizeFor(data);
    return {
      ...node,
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
    };
  });

  // Post-layout: center within viewport
  if (positioned.length > 0) {
    const xs = positioned.map(p => p.position.x);
    const ys = positioned.map(p => p.position.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs) + nodeW;
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys) + nodeH;
    const layoutW = maxX - minX;
    const layoutH = maxY - minY;
    const offsetX = (vw - layoutW) / 2 - minX;
    const offsetY = (vh - layoutH) / 2 - minY;

    for (const node of positioned) {
      node.position.x += offsetX;
      node.position.y += offsetY;
    }
  }

  return positioned;
}
