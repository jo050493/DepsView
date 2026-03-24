import { useState, useCallback, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { ExtensionToWebviewMessage, WebviewNodeData, WebviewEdgeData, GraphDataMessage } from '../../shared/protocol.js';
import type { ClusterNodeData } from '../components/ClusterNode.js';
import { useMessageListener } from './useVscodeMessaging.js';
import { computeHeat } from '../utils/heatmap.js';

interface GraphState {
  nodes: Node<WebviewNodeData>[];
  clusterNodes: Node<ClusterNodeData>[];
  edges: Edge<WebviewEdgeData>[];
  stats: GraphDataMessage['payload']['stats'] | null;
  folders: string[];
}

function buildClusterNodes(
  rawNodes: Array<{ id: string; data: WebviewNodeData }>,
  rawEdges: Array<{ id: string; source: string; target: string; data: WebviewEdgeData }>,
): Node<ClusterNodeData>[] {
  // Group files by folder
  const folderFiles = new Map<string, string[]>();
  const nodeFolder = new Map<string, string>();
  for (const n of rawNodes) {
    const folder = n.data.folder;
    if (!folderFiles.has(folder)) folderFiles.set(folder, []);
    folderFiles.get(folder)!.push(n.id);
    nodeFolder.set(n.id, folder);
  }

  // Create clusters for ALL folders (even with 1 file) to reduce orphans
  const clusters: Node<ClusterNodeData>[] = [];
  for (const [folder, files] of folderFiles) {

    const fileSet = new Set(files);
    let inEdgeCount = 0;
    let outEdgeCount = 0;
    for (const e of rawEdges) {
      const srcInCluster = fileSet.has(e.source);
      const tgtInCluster = fileSet.has(e.target);
      if (srcInCluster && !tgtInCluster) outEdgeCount++;
      if (!srcInCluster && tgtInCluster) inEdgeCount++;
    }

    // Dominant category for cluster color
    const categoryCounts = new Map<string, number>();
    for (const fileId of files) {
      const node = rawNodes.find(n => n.id === fileId);
      if (node) {
        const cat = node.data.category;
        categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
      }
    }
    let dominantCategory = 'unknown';
    let maxCount = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > maxCount) { maxCount = count; dominantCategory = cat; }
    }

    clusters.push({
      id: `cluster:${folder}`,
      type: 'cluster',
      position: { x: 0, y: 0 },
      data: {
        folder,
        fileCount: files.length,
        inEdgeCount,
        outEdgeCount,
        collapsed: false,
        clusterWidth: 0,
        clusterHeight: 0,
        dominantCategory: dominantCategory as import('../../shared/protocol.js').FileCategory,
      },
      style: { zIndex: 0 },
      selectable: true,
      draggable: false,
    });
  }

  return clusters;
}

export function useGraphData(): GraphState & { lastUpdateTs: number } {
  const [state, setState] = useState<GraphState>({
    nodes: [],
    clusterNodes: [],
    edges: [],
    stats: null,
    folders: [],
  });
  const [lastUpdateTs, setLastUpdateTs] = useState(0);

  const prevNodeIdsRef = useRef<Set<string>>(new Set());
  const prevEdgeCountRef = useRef(0);

  const handleMessage = useCallback((message: ExtensionToWebviewMessage) => {
    if (message.type !== 'graphData') return;

    const { nodes: rawNodes, edges: rawEdges, stats, folders } = message.payload;

    const nodes: Node<WebviewNodeData>[] = rawNodes.map(n => ({
      id: n.id,
      type: 'file',
      position: { x: 0, y: 0 },
      style: { zIndex: 1 },
      data: n.data,
    }));

    // Build heat map for edge heat-awareness
    const nodeHeatMap = new Map(rawNodes.map(n => [n.id, n.data.lastModifiedMs]));

    const edges: Edge<WebviewEdgeData>[] = rawEdges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'dependency',
      data: {
        ...e.data,
        sourceHeat: computeHeat(nodeHeatMap.get(e.source) ?? 0),
        targetHeat: computeHeat(nodeHeatMap.get(e.target) ?? 0),
      },
    }));

    // Mark newly appeared nodes (for enter animation)
    const prevIds = prevNodeIdsRef.current;
    const hasHistory = prevIds.size > 0;
    const finalNodes = hasHistory
      ? nodes.map(n => ({ ...n, data: { ...n.data, isNew: !prevIds.has(n.id) } }))
      : nodes;
    prevNodeIdsRef.current = new Set(nodes.map(n => n.id));

    const clusterNodes = buildClusterNodes(rawNodes, rawEdges);

    // Track if this is a real update (not initial load)
    const isUpdate = prevEdgeCountRef.current > 0;
    prevEdgeCountRef.current = edges.length;

    setState({ nodes: finalNodes, clusterNodes, edges, stats, folders });
    if (isUpdate) setLastUpdateTs(Date.now());
  }, []);

  useMessageListener(handleMessage);

  return { ...state, lastUpdateTs };
}
