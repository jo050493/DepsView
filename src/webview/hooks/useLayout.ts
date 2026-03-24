import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { LayoutMode, WebviewNodeData } from '../../shared/protocol.js';
import type { ClusterNodeData } from '../components/ClusterNode.js';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force';

const CLUSTER_PADDING = 12;
const CLUSTER_TOP_PADDING = 22;
const NODE_WIDTH = 85;
const NODE_HEIGHT = 96;

function positionClusters(
  fileNodes: Node<WebviewNodeData>[],
  clusterNodes: Node<ClusterNodeData>[],
): Node<ClusterNodeData>[] {
  const folderPositions = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();

  for (const node of fileNodes) {
    const folder = (node.data as WebviewNodeData).folder;
    const x = node.position.x;
    const y = node.position.y;

    const existing = folderPositions.get(folder);
    if (existing) {
      existing.minX = Math.min(existing.minX, x);
      existing.minY = Math.min(existing.minY, y);
      existing.maxX = Math.max(existing.maxX, x + NODE_WIDTH);
      existing.maxY = Math.max(existing.maxY, y + NODE_HEIGHT);
    } else {
      folderPositions.set(folder, {
        minX: x,
        minY: y,
        maxX: x + NODE_WIDTH,
        maxY: y + NODE_HEIGHT,
      });
    }
  }

  return clusterNodes.map(cluster => {
    const folder = cluster.data.folder;
    const bounds = folderPositions.get(folder);
    if (!bounds) return cluster;

    const w = bounds.maxX - bounds.minX + CLUSTER_PADDING * 2;
    const h = bounds.maxY - bounds.minY + CLUSTER_PADDING + CLUSTER_TOP_PADDING;

    return {
      ...cluster,
      position: {
        x: bounds.minX - CLUSTER_PADDING,
        y: bounds.minY - CLUSTER_TOP_PADDING,
      },
      data: {
        ...cluster.data,
        clusterWidth: w,
        clusterHeight: h,
      },
      width: w,
      height: h,
    };
  });
}

const COLLAPSED_WIDTH = 260;
const COLLAPSED_HEIGHT = 70;
const COLLAPSED_SMALL_WIDTH = 180;
const COLLAPSED_SMALL_HEIGHT = 40;
const GRID_GAP_X = 16;
const GRID_GAP_Y = 22;

function gridLayout<T>(
  items: Array<{ id: string; width: number; height: number; data: T }>,
  viewportWidth: number,
  viewportHeight: number,
): Array<{ id: string; x: number; y: number }> {
  if (items.length === 0) return [];

  const aspectRatio = viewportWidth / viewportHeight;
  let totalArea = 0;
  for (const item of items) {
    totalArea += (item.width + GRID_GAP_X) * (item.height + GRID_GAP_Y);
  }
  const idealWidth = Math.sqrt(totalArea * aspectRatio);
  const maxItemWidth = items.reduce((m, i) => Math.max(m, i.width), 0);
  const maxRowWidth = Math.max(maxItemWidth + GRID_GAP_X, idealWidth);

  const positions: Array<{ id: string; x: number; y: number }> = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  for (const item of items) {
    if (x > 0 && x + item.width > maxRowWidth) {
      x = 0;
      y += rowHeight + GRID_GAP_Y;
      rowHeight = 0;
    }
    positions.push({ id: item.id, x, y });
    x += item.width + GRID_GAP_X;
    rowHeight = Math.max(rowHeight, item.height);
  }

  return positions;
}

interface FolderBlock {
  folder: string;
  id: string;
  width: number;
  height: number;
  files: Node<WebviewNodeData>[];
  cols: number;
  isCollapsed: boolean;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  halfW: number;
  halfH: number;
}

/**
 * Custom rectangular collision force for D3.
 * Prevents cluster overlap by separating along the axis of least penetration.
 */
function forceRectCollide(padding: number = 20) {
  let nodes: SimNode[] = [];

  function force(alpha: number) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        const overlapX = (a.halfW + b.halfW + padding) - Math.abs(dx);
        const overlapY = (a.halfH + b.halfH + padding) - Math.abs(dy);

        if (overlapX > 0 && overlapY > 0) {
          // Separate along the axis of least penetration
          const strength = 1.0;
          if (overlapX < overlapY) {
            const shift = overlapX * strength * 0.5;
            const sign = dx > 0 ? 1 : -1;
            a.x! -= shift * sign;
            b.x! += shift * sign;
          } else {
            const shift = overlapY * strength * 0.5;
            const sign = dy > 0 ? 1 : -1;
            a.y! -= shift * sign;
            b.y! += shift * sign;
          }
        }
      }
    }
  }

  force.initialize = (n: SimNode[]) => { nodes = n; };
  return force;
}

/**
 * Force-directed layout at the cluster level.
 * Clusters with more cross-dependencies are attracted to each other.
 * Uses rectangular collision, proportional link strength, and differentiated charge.
 */
function forceClusterLayout(
  blocks: FolderBlock[],
  edges: Edge[],
  vw: number,
  vh: number,
): Map<string, { x: number; y: number }> {
  // Build cluster → cluster edge counts
  const fileToFolder = new Map<string, string>();
  for (const block of blocks) {
    for (const f of block.files) fileToFolder.set(f.id, block.folder);
  }

  const pairCounts = new Map<string, number>();
  for (const e of edges) {
    const srcFolder = fileToFolder.get(e.source);
    const tgtFolder = fileToFolder.get(e.target);
    if (!srcFolder || !tgtFolder || srcFolder === tgtFolder) continue;
    const key = srcFolder < tgtFolder ? `${srcFolder}→${tgtFolder}` : `${tgtFolder}→${srcFolder}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }

  // Count total inter-cluster links per cluster
  const clusterLinkCount = new Map<string, number>();
  for (const [key, count] of pairCounts) {
    const [src, tgt] = key.split('→');
    clusterLinkCount.set(src, (clusterLinkCount.get(src) ?? 0) + count);
    clusterLinkCount.set(tgt, (clusterLinkCount.get(tgt) ?? 0) + count);
  }

  const simNodes: SimNode[] = blocks.map(b => ({
    id: b.id,
    x: Math.random() * vw,
    y: Math.random() * vh,
    halfW: b.width / 2,
    halfH: b.height / 2,
  }));

  const simLinks: Array<SimulationLinkDatum<SimNode> & { source: string; target: string; count: number }> = [];
  for (const [key, count] of pairCounts) {
    const [src, tgt] = key.split('→');
    simLinks.push({ source: `cluster:${src}`, target: `cluster:${tgt}`, count });
  }

  // Differentiated charge: isolated clusters repel more, coupled clusters less
  const chargeForNode = (d: SimNode): number => {
    const folder = d.id.replace('cluster:', '');
    const linkCount = clusterLinkCount.get(folder) ?? 0;
    if (linkCount >= 5) return -200;  // Very coupled: weak repulsion
    if (linkCount >= 2) return -400;  // Moderately coupled
    return -800;                       // Isolated: strong repulsion
  };

  const simulation = forceSimulation(simNodes)
    .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode> & { count: number }>(simLinks)
      .id(d => d.id)
      .distance(link => Math.max(100, 300 - link.count * 10))
      .strength(link => Math.min(1.0, Math.max(0.3, link.count / 10))))
    .force('charge', forceManyBody<SimNode>().strength(d => chargeForNode(d)))
    .force('center', forceCenter(vw / 2, vh / 2))
    .force('collide', forceRectCollide(40))
    .stop();

  for (let i = 0; i < 120; i++) simulation.tick();

  const posMap = new Map<string, { x: number; y: number }>();
  for (const sn of simNodes) {
    posMap.set(sn.id, { x: sn.x ?? 0, y: sn.y ?? 0 });
  }
  return posMap;
}

export function useLayout(
  nodes: Node<WebviewNodeData>[],
  clusterNodes: Node<ClusterNodeData>[],
  edges: Edge[],
  mode: LayoutMode,
  collapsedFolders?: Set<string>,
  viewport?: { width: number; height: number },
): { fileNodes: Node<WebviewNodeData>[]; clusterNodes: Node<ClusterNodeData>[] } {
  return useMemo(() => {
    const vw = viewport?.width ?? 1000;
    const vh = viewport?.height ?? 700;
    const collapsedClusters = clusterNodes.filter(c => collapsedFolders?.has(c.data.folder));
    const expandedClusters = clusterNodes.filter(c => !collapsedFolders?.has(c.data.folder));

    const FILE_W = NODE_WIDTH;
    const FILE_H = NODE_HEIGHT;
    const INNER_GAP = 6;

    // Build ALL cluster blocks with their expanded size
    const allFilesByFolder = new Map<string, Node<WebviewNodeData>[]>();
    for (const n of nodes) {
      const folder = (n.data as WebviewNodeData).folder;
      if (!allFilesByFolder.has(folder)) allFilesByFolder.set(folder, []);
      allFilesByFolder.get(folder)!.push(n);
    }

    const folderBlocks: FolderBlock[] = [];
    for (const cluster of clusterNodes) {
      const folder = cluster.data.folder;
      const isCollapsed = collapsedFolders?.has(folder) ?? false;
      const visibleFiles = isCollapsed ? [] : (allFilesByFolder.get(folder) ?? []);
      const fileCount = cluster.data.fileCount;

      const cols = Math.max(1, Math.ceil(Math.sqrt(fileCount)));
      const rows = Math.ceil(fileCount / cols);
      const expandedW = cols * (FILE_W + INNER_GAP) - INNER_GAP + CLUSTER_PADDING * 2;
      const expandedH = rows * (FILE_H + INNER_GAP) - INNER_GAP + CLUSTER_PADDING + CLUSTER_TOP_PADDING;

      // Use collapsed size for layout when collapsed — avoids huge empty gaps
      const collapsedW = Math.max(COLLAPSED_SMALL_WIDTH, Math.min(COLLAPSED_WIDTH, Math.sqrt(fileCount) * 60));
      const collapsedH = fileCount <= 2 ? COLLAPSED_SMALL_HEIGHT : COLLAPSED_HEIGHT;
      const blockW = isCollapsed ? collapsedW : expandedW;
      const blockH = isCollapsed ? collapsedH : expandedH;

      folderBlocks.push({ folder, id: `cluster:${folder}`, width: blockW, height: blockH, files: visibleFiles, cols, isCollapsed });
    }

    // --- Choose positioning strategy based on mode ---
    let blockPosMap: Map<string, { x: number; y: number }>;

    if (mode === 'force-directed') {
      // Couplage mode: D3-force positions clusters by dependency gravity
      blockPosMap = forceClusterLayout(folderBlocks, edges, vw, vh);
    } else {
      // Structure mode: row-packing grid (default)
      folderBlocks.sort((a, b) => b.height * b.width - a.height * a.width);
      const blockItems = folderBlocks.map(b => ({ id: b.id, width: b.width, height: b.height, data: b }));
      const blockPositions = gridLayout(blockItems, vw, vh);
      blockPosMap = new Map(blockPositions.map(p => [p.id, { x: p.x, y: p.y }]));
    }

    // Position visible files within expanded folder blocks
    const positionedFiles: Node<WebviewNodeData>[] = [];
    for (const block of folderBlocks) {
      if (block.isCollapsed) continue;
      const blockPos = blockPosMap.get(block.id) ?? { x: 0, y: 0 };
      for (let i = 0; i < block.files.length; i++) {
        const col = i % block.cols;
        const row = Math.floor(i / block.cols);
        positionedFiles.push({
          ...block.files[i],
          position: {
            x: blockPos.x + CLUSTER_PADDING + col * (FILE_W + INNER_GAP),
            y: blockPos.y + CLUSTER_TOP_PADDING + row * (FILE_H + INNER_GAP),
          },
          width: FILE_W,
          height: FILE_H,
        });
      }
    }

    // Position expanded clusters from file bounding boxes
    const positionedExpanded = positionClusters(positionedFiles, expandedClusters);

    // Position collapsed clusters — centered within their reserved slot
    const positionedCollapsed = collapsedClusters.map(c => {
      const blockPos = blockPosMap.get(c.id) ?? { x: 0, y: 0 };
      const fc = c.data.fileCount;
      const cw = Math.max(COLLAPSED_SMALL_WIDTH, Math.min(COLLAPSED_WIDTH, Math.sqrt(fc) * 60));
      const ch = fc <= 2 ? COLLAPSED_SMALL_HEIGHT : COLLAPSED_HEIGHT;
      return {
        ...c,
        position: { x: blockPos.x, y: blockPos.y },
        data: { ...c.data, clusterWidth: cw, clusterHeight: ch },
        width: cw,
        height: ch,
      };
    });

    return {
      fileNodes: positionedFiles,
      clusterNodes: [...positionedExpanded, ...positionedCollapsed],
    };
  }, [nodes, clusterNodes, edges, mode, collapsedFolders, viewport]);
}
