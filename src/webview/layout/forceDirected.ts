import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force';
import type { Node, Edge } from '@xyflow/react';

interface SimNode extends SimulationNodeDatum {
  id: string;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string;
  target: string;
}

export function computeForceLayout<N, E>(
  nodes: Node<N>[],
  edges: Edge<E>[],
  viewport?: { width: number; height: number },
): Node<N>[] {
  const vw = viewport?.width ?? 800;
  const vh = viewport?.height ?? 600;

  // Density-aware parameters
  const area = vw * vh;
  const density = nodes.length / (area / 10000);
  const linkDist = density > 2 ? 120 : density > 1 ? 160 : 200;
  const charge = density > 2 ? -300 : density > 1 ? -400 : -500;
  const collide = density > 2 ? 60 : 90;

  const simNodes: SimNode[] = nodes.map(n => ({
    id: n.id,
    x: Math.random() * vw,
    y: Math.random() * vh,
  }));

  const simLinks: SimLink[] = edges.map(e => ({
    source: e.source,
    target: e.target,
  }));

  const simulation = forceSimulation(simNodes)
    .force('link', forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(linkDist))
    .force('charge', forceManyBody().strength(charge))
    .force('center', forceCenter(vw / 2, vh / 2))
    .force('collide', forceCollide(collide))
    .stop();

  // Run simulation synchronously
  for (let i = 0; i < 300; i++) {
    simulation.tick();
  }

  const positionMap = new Map<string, { x: number; y: number }>();
  for (const simNode of simNodes) {
    positionMap.set(simNode.id, { x: simNode.x ?? 0, y: simNode.y ?? 0 });
  }

  return nodes.map(node => {
    const pos = positionMap.get(node.id);
    if (!pos) return node;
    return {
      ...node,
      position: { x: pos.x, y: pos.y },
    };
  });
}
