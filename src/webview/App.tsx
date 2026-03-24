import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ReactFlow, ReactFlowProvider, Controls, MiniMap, Background, BackgroundVariant, MarkerType, useReactFlow, type NodeMouseHandler, type EdgeMouseHandler } from '@xyflow/react';
import { toPng } from 'html-to-image';
import '@xyflow/react/dist/style.css';
import type { LayoutMode, WebviewNodeData, FileCategory } from '../shared/protocol.js';
import { useGraphData } from './hooks/useGraphData.js';
import { useLayout } from './hooks/useLayout.js';
import { useActiveFile } from './hooks/useActiveFile.js';
import { useDetections } from './hooks/useDetections.js';
import { useImpactRadius } from './hooks/useImpactRadius.js';
import { postMessage, useMessageListener } from './hooks/useVscodeMessaging.js';
import { FileNode } from './components/FileNode.js';
import { DependencyEdge } from './components/DependencyEdge.js';
import { ClusterNode } from './components/ClusterNode.js';
import { TopBar } from './components/TopBar.js';
import { Legend } from './components/Legend.js';
import { Sidebar } from './components/Sidebar.js';
import { SearchBar } from './components/SearchBar.js';
import { COLORS, CATEGORY_COLORS } from './utils/colors.js';
import { useViewportSize } from './hooks/useViewportSize.js';
import { computeBfsDistances, computePresence } from './utils/presence.js';

const nodeTypes = { file: FileNode, cluster: ClusterNode };
const edgeTypes = { dependency: DependencyEdge };

const globalStyles = `
  /* Custom scrollbar — thin, dark, matches theme */
  ::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: ${COLORS.border};
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: ${COLORS.textMuted};
  }
  .react-flow__node {
    transition: transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1), opacity 0.25s ease;
  }
  .depsview-filenode {
    transition: opacity 0.25s ease, filter 0.15s ease;
  }
  /* CSS animations replacing SVG <animate> for GPU acceleration */
  .heat-pulse {
    animation: heatPulse 1.5s ease-in-out infinite;
  }
  @keyframes heatPulse {
    0%, 100% { opacity: 0.5; stroke-width: 2px; }
    50% { opacity: 0.9; stroke-width: 3px; }
  }
  .touched-pulse {
    animation: touchPulse 1.5s ease-in-out infinite;
  }
  @keyframes touchPulse {
    0%, 100% { r: 3; opacity: 0.8; }
    50% { r: 5; opacity: 0.3; }
  }
  .depsview-filenode:hover {
    filter: brightness(1.2);
  }
  /* Cluster hover */
  .depsview-cluster {
    transition: filter 0.15s ease;
  }
  .depsview-cluster:hover {
    filter: brightness(1.15);
  }
  /* Edges always below nodes */
  .react-flow__edges {
    z-index: 0 !important;
  }
  /* Edge interactions — no hover effect on edges directly, only via node highlight */
  .react-flow__edge {
    pointer-events: none;
  }
  .react-flow__edge path {
    transition: opacity 0.05s ease, stroke-width 0.05s ease;
  }
  @keyframes highlightPulse {
    0% { opacity: 0.8; }
    100% { opacity: 0; }
  }
  @keyframes dashRotate {
    0% { stroke-dashoffset: 0; }
    100% { stroke-dashoffset: 26; }
  }
  @keyframes nodeEnter {
    from { transform: scale(0.5); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  .node-entered {
    animation: nodeEnter 0.4s ease-out;
  }
  .impact-source .depsview-filenode {
    filter: brightness(1.3) !important;
  }
  .impact-source .impact-hover-ring {
    opacity: 0.8 !important;
    animation: dashRotate 0.8s linear infinite !important;
  }
  .impact-level-1 .impact-hover-ring {
    opacity: 0.6 !important;
    stroke: #ef4444 !important;
  }
  .impact-level-2 .impact-hover-ring {
    opacity: 0.4 !important;
    stroke: #f97316 !important;
  }
  .hover-dimmed {
    opacity: 0.15 !important;
  }
  .hover-dimmed-soft .react-flow__edge-path {
    opacity: 0.35 !important;
  }
  .edge-highlighted .react-flow__edge-path {
    opacity: 0.75 !important;
    stroke-width: 1.8px !important;
    transition: opacity 0.15s ease, stroke-width 0.15s ease;
  }
  .edge-highlighted .edge-count-badge {
    opacity: 1 !important;
  }
  .edge-highlighted .edge-spec-label {
    opacity: 1 !important;
  }
  .focus-dimmed {
    opacity: 0.03 !important;
    pointer-events: none;
    transition: opacity 0.25s ease;
  }
  .focus-active {
    filter: brightness(1.15);
    transition: opacity 0.3s ease, filter 0.2s ease;
  }

  /* LOD: minimal — hide everything except file icon, disable transitions */
  [data-lod="minimal"] .react-flow__node,
  [data-lod="minimal"] .depsview-filenode,
  [data-lod="minimal"] .depsview-cluster {
    transition: none !important;
  }
  [data-lod="minimal"] .file-stats,
  [data-lod="minimal"] .file-description,
  [data-lod="minimal"] .file-name,
  [data-lod="minimal"] .orphan-badge,
  [data-lod="minimal"] .impact-hover-ring,
  [data-lod="minimal"] .heat-pulse,
  [data-lod="minimal"] .touched-pulse {
    display: none !important;
  }
  /* LOD: compact — hide stats + description, keep name bold */
  [data-lod="compact"] .react-flow__node,
  [data-lod="compact"] .depsview-filenode {
    transition: none !important;
  }
  [data-lod="compact"] .file-stats,
  [data-lod="compact"] .file-description,
  [data-lod="compact"] .orphan-badge {
    display: none !important;
  }
  [data-lod="compact"] .file-name {
    font-size: 13px !important;
    font-weight: bold !important;
  }
  /* LOD: reduced — hide description only */
  [data-lod="reduced"] .file-description {
    display: none !important;
  }
`;

const ASSET_EXTENSIONS = new Set(['.css', '.scss', '.less', '.sass', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4']);

const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#3b82f680' },
};

function GraphCanvas() {
  const { nodes, clusterNodes, edges, stats, lastUpdateTs } = useGraphData();
  const layoutMode: LayoutMode = 'hierarchical'; // Single mode — Couplage removed
  const [selectedNodeData, setSelectedNodeData] = useState<WebviewNodeData | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusDepth, setFocusDepth] = useState(1);
  // searchQuery kept for compatibility — now driven by SearchBar
  const [showOnboarding, setShowOnboarding] = useState(true);

  // Auto-dismiss onboarding toast after 5 seconds
  useEffect(() => {
    if (!showOnboarding) return;
    const timer = setTimeout(() => setShowOnboarding(false), 8000);
    return () => clearTimeout(timer);
  }, [showOnboarding]);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const [semanticFilters, setSemanticFilters] = useState({ showTests: true, showConfigs: true, showAssets: true });
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const activeFile = useActiveFile();
  const detections = useDetections();
  const { impactState, onNodeHover } = useImpactRadius(edges);
  const viewportSize = useViewportSize();

  const currentLodRef = useRef<string>('full');

  // Auto-focus on active file when switching in VS Code
  useEffect(() => {
    if (!activeFile) return;
    const edgeCount = edges.filter(e => e.source === activeFile || e.target === activeFile).length;
    if (edgeCount >= 1) {
      setFocusNodeId(activeFile);
      const node = nodes.find(n => n.id === activeFile);
      if (node) setSelectedNodeData(node.data as WebviewNodeData);
    }
  }, [activeFile]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Escape: exit focus mode + deselect
      if (e.key === 'Escape') {
        if (focusNodeId) { setFocusNodeId(null); e.preventDefault(); return; }
        if (selectedNodeData) { setSelectedNodeData(null); e.preventDefault(); return; }
      }
      // Ctrl+F / Cmd+F: focus search bar
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('input[placeholder="Search files..."]');
        searchInput?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusNodeId, selectedNodeData]);

  // Auto-collapse small clusters (≤3 files) on first load
  const hasAutoCollapsed = useRef(false);
  useEffect(() => {
    if (hasAutoCollapsed.current || nodes.length === 0) return;
    hasAutoCollapsed.current = true;
    const folderCounts = new Map<string, number>();
    for (const n of nodes) {
      const folder = (n.data as WebviewNodeData).folder;
      folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1);
    }
    const smallFolders = new Set<string>();
    for (const [folder, count] of folderCounts) {
      if (count <= 3) smallFolders.add(folder);
    }
    if (smallFolders.size > 0) setCollapsedFolders(smallFolders);
  }, [nodes]);

  // DOM-based hover impact — uses React Flow callbacks for reliable node detection
  // + DOM manipulation for zero re-renders
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const allEdgesRef = useRef<typeof edges>([]);

  // Map folder → file IDs for cluster hover highlighting
  const folderFilesRef = useRef<Map<string, Set<string>>>(new Map());
  useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of nodes) {
      const d = n.data as WebviewNodeData;
      let set = map.get(d.folder);
      if (!set) { set = new Set(); map.set(d.folder, set); }
      set.add(n.id);
    }
    folderFilesRef.current = map;
  }, [nodes]);
  const lockedNodeRef = useRef<string | null>(null);
  const suppressHoverUntilRef = useRef<number>(0);
  const hoverDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const lastHoveredRef = useRef<string | null>(null);
  const highlightedElsRef = useRef<Set<Element>>(new Set());

  const applyHighlight = useCallback((nodeId: string) => {
    const container = document.querySelector('.react-flow');
    if (!container) return;

    const connected = new Set<string>([nodeId]);

    // If hovering a cluster, include all files inside + their external connections
    const isCluster = nodeId.startsWith('cluster:');
    let clusterFileIds: Set<string> | undefined;
    if (isCluster) {
      const folder = nodeId.slice('cluster:'.length);
      clusterFileIds = folderFilesRef.current.get(folder);
      if (clusterFileIds) {
        for (const fileId of clusterFileIds) connected.add(fileId);
        // Also find nodes connected to files inside this cluster (cross-folder edges)
        for (const edge of allEdgesRef.current) {
          if (clusterFileIds.has(edge.source)) connected.add(edge.target);
          if (clusterFileIds.has(edge.target)) connected.add(edge.source);
        }
      }
    }

    // For file nodes, find direct connections (file-to-file intra-cluster edges)
    // + include cluster edges from this file's folder (inter-cluster aggregated edges)
    const fileFolder = isCluster ? null : (() => {
      const folder = folderFilesRef.current;
      for (const [f, fileIds] of folder) {
        if (fileIds.has(nodeId)) return f;
      }
      return null;
    })();
    const fileClusterId = fileFolder ? `cluster:${fileFolder}` : null;
    // Always include the file's own cluster as connected
    if (fileClusterId) connected.add(fileClusterId);

    for (const edge of allEdgesRef.current) {
      if (edge.source === nodeId) connected.add(edge.target);
      if (edge.target === nodeId) connected.add(edge.source);
      // Include cluster-level connections for file's parent cluster
      if (fileClusterId) {
        if (edge.source === fileClusterId) connected.add(edge.target);
        if (edge.target === fileClusterId) connected.add(edge.source);
      }
    }
    // Also include the parent clusters of all connected file nodes
    for (const connId of [...connected]) {
      if (connId.startsWith('cluster:')) continue;
      for (const [folder, fileIds] of folderFilesRef.current) {
        if (fileIds.has(connId)) {
          connected.add(`cluster:${folder}`);
          break;
        }
      }
    }

    const touched = highlightedElsRef.current;

    // Highlight source node
    const srcEl = container.querySelector(`[data-id="${nodeId}"]`);
    if (srcEl) { srcEl.classList.add('impact-source'); touched.add(srcEl); }

    // Highlight ONLY connected nodes — no dimming of the rest
    for (const connId of connected) {
      if (connId === nodeId) continue;
      const el = container.querySelector(`[data-id="${connId}"]`);
      if (!el || el.classList.contains('focus-dimmed')) continue;
      if (connId === fileClusterId) { el.classList.add('impact-level-2'); }
      else { el.classList.add('impact-level-1'); }
      touched.add(el);
    }

    // Highlight ONLY connected edges — no dimming of the rest
    const connectedEdgeIds = new Set<string>();
    for (const edge of allEdgesRef.current) {
      if (edge.source === nodeId || edge.target === nodeId) connectedEdgeIds.add(edge.id);
      if (clusterFileIds) {
        if (clusterFileIds.has(edge.source) || clusterFileIds.has(edge.target)) connectedEdgeIds.add(edge.id);
      }
      if (fileClusterId) {
        if (edge.source === fileClusterId || edge.target === fileClusterId) connectedEdgeIds.add(edge.id);
      }
    }
    for (const edgeId of connectedEdgeIds) {
      const el = container.querySelector(`[data-id="${edgeId}"]`);
      if (el && !el.classList.contains('focus-dimmed')) {
        el.classList.add('edge-highlighted');
        touched.add(el);
      }
    }
  }, []);

  const HOVER_CLASSES = ['impact-source', 'impact-level-1', 'impact-level-2', 'impact-level-3', 'hover-dimmed', 'hover-dimmed-soft', 'edge-highlighted'] as const;

  const clearHighlight = useCallback(() => {
    // Only clean elements we actually touched — avoids full DOM scan
    for (const el of highlightedElsRef.current) {
      el.classList.remove(...HOVER_CLASSES);
    }
    highlightedElsRef.current.clear();
  }, []);

  // React Flow callbacks — reliable for ALL node types (file + cluster)
  // Key design: NEVER clear on leave alone — only swap on enter or clear after long idle.
  // This prevents the flash caused by clear→gap→reapply when moving between adjacent nodes.
  const onNodeMouseEnter: NodeMouseHandler = useCallback((_e, node) => {
    if (lockedNodeRef.current) return;
    if (Date.now() < suppressHoverUntilRef.current) return;
    if (node.className === 'focus-dimmed') return;
    const lod = document.querySelector('.react-flow')?.getAttribute('data-lod');
    if (lod === 'minimal') return;
    lastHoveredRef.current = node.id;
    if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current);
    hoverDebounceRef.current = setTimeout(() => {
      if (lastHoveredRef.current !== node.id) return;
      clearHighlight();
      applyHighlight(node.id);
    }, 40);
  }, [applyHighlight, clearHighlight]);

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    if (lockedNodeRef.current) return;
    lastHoveredRef.current = null;
    if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current);
    hoverDebounceRef.current = setTimeout(() => {
      if (lastHoveredRef.current !== null) return;
      clearHighlight();
    }, 120);
  }, [clearHighlight]);

  // Click-lock via DOM (background click to unlock)
  useEffect(() => {
    const container = document.querySelector('.react-flow');
    if (!container) return;

    function handleClick(e: Event) {
      const nodeEl = (e.target as HTMLElement).closest('.react-flow__node');
      if (nodeEl) {
        // Click on any node: clear lock so hover remains free in focus mode
        lockedNodeRef.current = null;
        clearHighlight();
      } else {
        const isPane = (e.target as HTMLElement).closest('.react-flow__pane');
        if (isPane) {
          lockedNodeRef.current = null;
          clearHighlight();
          setSelectedNodeData(null);
        }
      }
    }

    container.addEventListener('click', handleClick, true);
    return () => container.removeEventListener('click', handleClick, true);
  }, [applyHighlight, clearHighlight]);
  const { fitView, getNodes } = useReactFlow();

  // Export graph as PNG via html-to-image
  const exportPng = useCallback(async () => {
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!viewport) return;

    const allNodes = getNodes();
    if (allNodes.length === 0) return;

    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of allNodes) {
      const x = n.position.x;
      const y = n.position.y;
      const w = (n.measured?.width ?? n.width ?? 85) as number;
      const h = (n.measured?.height ?? n.height ?? 68) as number;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    }

    const pad = 40;
    const width = Math.ceil(maxX - minX + pad * 2);
    const height = Math.ceil(maxY - minY + pad * 2);

    try {
      const dataUrl = await toPng(viewport, {
        backgroundColor: COLORS.bg,
        width,
        height,
        pixelRatio: 2,
        style: {
          transform: `translate(${-minX + pad}px, ${-minY + pad}px) scale(1)`,
          width: `${width}px`,
          height: `${height}px`,
        },
      });

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `depsview-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [getNodes]);

  // Listen for focusFile command from extension (e.g. "Focus Current File in Graph")
  const focusFileHandler = useCallback((msg: import('../shared/protocol.js').ExtensionToWebviewMessage) => {
    if (msg.type === 'focusFile') {
      const relPath = msg.payload.relativePath;
      const targetNode = nodes.find(n => (n.data as WebviewNodeData).relativePath === relPath);
      if (!targetNode) return;
      setSelectedNodeData(targetNode.data as WebviewNodeData);
      const edgeCount = edges.filter(e => e.source === targetNode.id || e.target === targetNode.id).length;
      if (edgeCount >= 2) setFocusNodeId(targetNode.id);
      setTimeout(() => {
        fitView({ nodes: [{ id: targetNode.id }], padding: 0.5, duration: 400 });
        setHighlightedNodes(new Set([targetNode.id]));
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => setHighlightedNodes(new Set()), 3000);
      }, 100);
    } else if ((msg as any).type === 'clipboardContent') {
      const p = (msg as any).payload;
      navigator.clipboard?.writeText(p.text).catch(() => {});
    }
  }, [nodes, edges, fitView]);
  useMessageListener(focusFileHandler);

  // Filter out collapsed nodes/edges BEFORE layout so dagre computes compact positions
  const visibleNodes = useMemo(() => {
    if (collapsedFolders.size === 0) return nodes;
    return nodes.filter(n => {
      const data = n.data as WebviewNodeData;
      return !collapsedFolders.has(data.folder);
    });
  }, [nodes, collapsedFolders]);

  // Map each file node to its folder (shared by visibleEdges + clusterEdges)
  const nodeToFolder = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nodes) {
      const data = n.data as WebviewNodeData;
      map.set(n.id, data.folder);
    }
    return map;
  }, [nodes]);

  // Filter out edges touching collapsed file nodes.
  // Keep all edges between visible (expanded) files. Edges are invisible by default
  // (opacity 0, couche 7) and only shown on hover via DOM highlight system.
  const visibleEdges = useMemo(() => {
    if (collapsedFolders.size === 0) return edges;
    const collapsedIds = new Set<string>();
    for (const n of nodes) {
      const data = n.data as WebviewNodeData;
      if (collapsedFolders.has(data.folder)) collapsedIds.add(n.id);
    }
    return edges.filter(e => !collapsedIds.has(e.source) && !collapsedIds.has(e.target));
  }, [nodes, edges, collapsedFolders]);

  // Compute synthetic cluster↔cluster edges when folders are collapsed.
  // These redirect file-to-file edges to their parent cluster nodes.
  const clusterEdges = useMemo(() => {
    if (collapsedFolders.size === 0) return [];

    const pairCounts = new Map<string, number>();
    for (const e of edges) {
      const srcFolder = nodeToFolder.get(e.source);
      const tgtFolder = nodeToFolder.get(e.target);
      if (!srcFolder || !tgtFolder || srcFolder === tgtFolder) continue;
      const srcCollapsed = collapsedFolders.has(srcFolder);
      const tgtCollapsed = collapsedFolders.has(tgtFolder);
      if (!srcCollapsed && !tgtCollapsed) continue;

      const src = srcCollapsed ? `cluster:${srcFolder}` : e.source;
      const tgt = tgtCollapsed ? `cluster:${tgtFolder}` : e.target;
      const key = `${src}||${tgt}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }

    return [...pairCounts.entries()].map(([key, count]) => {
      const [source, target] = key.split('||');
      return {
        id: `ce-${source}-${target}`,
        source,
        target,
        type: 'dependency' as const,
        data: { specifiers: [], kind: 'static' as const, line: 0, specifierCount: count },
      };
    });
  }, [nodes, edges, collapsedFolders, nodeToFolder]);

  // Create ghost edges for shadow/phantom imports (always visible, red dashed)
  const ghostEdges = useMemo(() => {
    if (!detections) return [];
    return detections.issues
      .filter(issue => issue.type === 'shadow' || issue.type === 'phantom')
      .filter(issue => issue.filePaths.length >= 2)
      .map((issue, i) => ({
        id: `ghost-${issue.type}-${i}`,
        source: issue.filePaths[0],
        target: issue.filePaths[1],
        type: 'dependency' as const,
        data: { specifiers: [], kind: 'static' as const, line: issue.line ?? 0, specifierCount: 1, isGhostEdge: true },
      }))
      // Only keep edges where both nodes exist in the graph
      .filter(e => nodeToFolder.has(e.source) && nodeToFolder.has(e.target));
  }, [detections, nodeToFolder]);

  // Combine visible file edges + synthetic cluster edges + ghost edges
  const allVisibleEdges = useMemo(() => [...visibleEdges, ...clusterEdges, ...ghostEdges], [visibleEdges, clusterEdges, ghostEdges]);
  allEdgesRef.current = allVisibleEdges;

  const { fileNodes: layoutNodes, clusterNodes: layoutClusters } = useLayout(visibleNodes, clusterNodes, allVisibleEdges, layoutMode, collapsedFolders, viewportSize);

  // Focus mode: compute visible nodes + depth via BFS (bidirectional, configurable depth)
  // Supports both file nodes and cluster nodes as focus anchor
  // Reset focus if the focused node no longer exists (e.g. after file update)
  useEffect(() => {
    if (!focusNodeId) return;
    const isCluster = focusNodeId.startsWith('cluster:');
    if (isCluster) {
      const folder = focusNodeId.slice('cluster:'.length);
      if (!folderFilesRef.current.has(folder)) setFocusNodeId(null);
    } else {
      if (!nodes.some(n => n.id === focusNodeId)) setFocusNodeId(null);
    }
  }, [focusNodeId, nodes]);

  const focusNodeDepths = useMemo(() => {
    if (!focusNodeId) return null;
    const depths = new Map<string, number>();

    // If focus is on a cluster, seed BFS with all files inside it
    const isClusterFocus = focusNodeId.startsWith('cluster:');
    if (isClusterFocus) {
      const folder = focusNodeId.slice('cluster:'.length);
      depths.set(focusNodeId, 0);
      const clusterFiles = folderFilesRef.current.get(folder);
      if (clusterFiles) {
        for (const fileId of clusterFiles) depths.set(fileId, 0);
      }
    } else {
      depths.set(focusNodeId, 0);
    }

    let current = [...depths.keys()].filter(k => k !== focusNodeId || !isClusterFocus);
    if (isClusterFocus) current = [...depths.keys()].filter(k => !k.startsWith('cluster:'));

    for (let depth = 1; depth <= focusDepth; depth++) {
      const next: string[] = [];
      for (const nodeId of current) {
        for (const edge of edges) {
          if (edge.source === nodeId && !depths.has(edge.target)) {
            depths.set(edge.target, depth);
            next.push(edge.target);
          }
          if (edge.target === nodeId && !depths.has(edge.source)) {
            depths.set(edge.source, depth);
            next.push(edge.source);
          }
        }
      }
      current = next;
    }

    // Include cluster nodes for all focused files (so clusters dim/activate correctly)
    // Build a quick nodeId → folder lookup from folderFilesRef (inverted)
    const nodeToFolder = new Map<string, string>();
    for (const [folder, fileIds] of folderFilesRef.current) {
      for (const fid of fileIds) nodeToFolder.set(fid, folder);
    }
    for (const [nodeId, depth] of [...depths]) {
      if (nodeId.startsWith('cluster:')) continue;
      const folder = nodeToFolder.get(nodeId);
      if (folder) {
        const clusterId = `cluster:${folder}`;
        if (!depths.has(clusterId)) {
          depths.set(clusterId, depth);
        }
      }
    }

    return depths;
  }, [focusNodeId, edges, focusDepth]);
  // Compat: Set view for checks that just need "is in focus?"
  const focusVisibleNodes = useMemo(() => {
    if (!focusNodeDepths) return null;
    return new Set(focusNodeDepths.keys());
  }, [focusNodeDepths]);

  // Build set of files with issues for badge
  const issueFiles = new Set<string>();
  if (detections) {
    for (const issue of detections.issues) {
      for (const fp of issue.filePaths) {
        issueFiles.add(fp);
      }
    }
  }

  // Build set of cycle edges
  const cycleEdgeSet = new Set<string>();
  if (detections) {
    for (const ce of detections.cycleEdges) {
      cycleEdgeSet.add(`${ce.source}->${ce.target}`);
    }
  }

  // Presence score: BFS distances + per-node scoring
  const presenceAnchor = selectedNodeData?.relativePath ?? activeFile;
  const presenceScores = useMemo(() => {
    const nowMs = Date.now();
    // Compute maxDegree across all nodes
    let maxDegree = 1;
    for (const n of nodes) {
      const d = n.data as WebviewNodeData;
      const deg = d.importCount + d.exportCount;
      if (deg > maxDegree) maxDegree = deg;
    }

    // BFS from anchor (active file or selected node)
    const bfsDistances = presenceAnchor
      ? computeBfsDistances(presenceAnchor, edges)
      : null;

    const scores = new Map<string, number>();
    for (const n of nodes) {
      const d = n.data as WebviewNodeData;
      const depth = bfsDistances?.get(n.id);
      scores.set(n.id, computePresence(depth, d.lastModifiedMs, d.importCount, d.exportCount, maxDegree, nowMs));
    }
    return scores;
  }, [nodes, edges, presenceAnchor]);

  // Apply impact levels, issue indicators, highlight, focus, semantic + category filter to file nodes
  const styledFileNodes = layoutNodes.map(node => {
      const nodeData = node.data as WebviewNodeData;
      const isCategoryHidden = hiddenCategories.has(nodeData.category);
      const isSemanticHidden =
        (!semanticFilters.showTests && nodeData.category === 'test') ||
        (!semanticFilters.showConfigs && nodeData.category === 'config') ||
        (!semanticFilters.showAssets && ASSET_EXTENSIONS.has(nodeData.extension));
      const presenceScore = presenceAnchor ? presenceScores.get(node.id) : undefined;
      const focusDepthLevel = focusNodeDepths?.get(node.id);
      const inFocus = !focusNodeDepths || focusDepthLevel !== undefined;

      // Graduated focus opacity: depth 0=1.0 bright, 1=0.9, 2=0.5, beyond=dimmed
      let className: string | undefined;
      let focusOpacity: number | undefined;
      if (isCategoryHidden || isSemanticHidden) className = 'focus-dimmed';
      else if (presenceScore !== undefined && presenceScore < 0.05) className = 'focus-dimmed';
      else if (focusNodeDepths) {
        if (!inFocus) {
          className = 'focus-dimmed';
        } else {
          className = 'focus-active';
          focusOpacity = focusDepthLevel === 0 ? 1.0
            : focusDepthLevel === 1 ? 0.9
            : 0.5;
        }
      }

      return {
        ...node,
        selected: node.id === activeFile,
        className,
        style: { ...node.style, opacity: focusOpacity },
        data: {
          ...node.data,
          presenceScore,
          focusDepthLevel,
          impactLevel: impactState.impactLevels.get(node.id),
          hasIssue: issueFiles.has(node.id) || issueFiles.has((node.data as WebviewNodeData).relativePath),
          highlighted: highlightedNodes.has(node.id),
        },
      };
    });

  // Compute health status per folder from detections
  const folderHealth = useMemo(() => {
    const map = new Map<string, { critical: number; warning: number }>();
    if (detections) {
      for (const issue of detections.issues) {
        for (const fp of issue.filePaths) {
          // Extract folder from file path
          const parts = fp.split('/');
          parts.pop(); // remove filename
          const folder = parts.join('/') || '.';
          const entry = map.get(folder) ?? { critical: 0, warning: 0 };
          if (issue.severity === 'critical') entry.critical++;
          else entry.warning++;
          map.set(folder, entry);
        }
      }
    }
    return map;
  }, [detections]);

  // Apply focus dimming + collapse state + health to cluster nodes
  const styledClusters = layoutClusters.map(cluster => {
    const isCollapsed = collapsedFolders.has(cluster.data.folder);
    const clusterInFocus = !focusVisibleNodes || focusVisibleNodes.has(cluster.id);
    const health = folderHealth.get(cluster.data.folder);
    const issueCount = health ? health.critical + health.warning : 0;
    const healthStatus = health?.critical ? 'critical' as const
      : health?.warning ? 'warning' as const
      : 'clean' as const;
    return {
      ...cluster,
      className: focusVisibleNodes ? (clusterInFocus ? 'focus-active' : 'focus-dimmed') : undefined,
      data: { ...cluster.data, collapsed: isCollapsed, healthStatus, issueCount },
    };
  });

  // Focus mode: repack connected clusters into a compact grid, removing gaps
  if (focusNodeId && focusVisibleNodes) {
    // Collect focus-active clusters and their files
    const activeClusters = styledClusters.filter(c => focusVisibleNodes.has(c.id));
    if (activeClusters.length > 0) {
      // Sort by size descending for better packing
      const sorted = [...activeClusters].sort((a, b) =>
        (b.data.clusterWidth * b.data.clusterHeight) - (a.data.clusterWidth * a.data.clusterHeight));

      // Pack into a compact grid
      const GAP = 20;
      let x = 0, y = 0, rowH = 0;
      const maxRowW = Math.max(800, sorted.reduce((s, c) => s + c.data.clusterWidth, 0) / 2);
      const newPositions = new Map<string, { x: number; y: number }>();

      for (const cluster of sorted) {
        const cw = cluster.data.clusterWidth ?? 200;
        const ch = cluster.data.clusterHeight ?? 100;
        if (x > 0 && x + cw > maxRowW) {
          x = 0;
          y += rowH + GAP + 20; // +20 for tab label
          rowH = 0;
        }
        newPositions.set(cluster.id, { x, y });
        x += cw + GAP;
        rowH = Math.max(rowH, ch);
      }

      // Apply new positions and compute deltas for files
      for (let i = 0; i < styledClusters.length; i++) {
        const newPos = newPositions.get(styledClusters[i].id);
        if (newPos) {
          const oldPos = styledClusters[i].position;
          const dx = newPos.x - oldPos.x;
          const dy = newPos.y - oldPos.y;
          styledClusters[i] = { ...styledClusters[i], position: newPos };
          // Move files inside this cluster by the same delta
          const folder = styledClusters[i].data.folder;
          for (let j = 0; j < styledFileNodes.length; j++) {
            if ((styledFileNodes[j].data as WebviewNodeData).folder === folder) {
              styledFileNodes[j] = {
                ...styledFileNodes[j],
                position: {
                  x: styledFileNodes[j].position.x + dx,
                  y: styledFileNodes[j].position.y + dy,
                },
              };
            }
          }
        }
      }
    }
  }

  // Combine cluster nodes (background) + file nodes
  const styledNodes = [...styledClusters, ...styledFileNodes];

  // Mark cycle edges + apply focus dimming with graduated ghost edges
  const styledEdges = allVisibleEdges.map(edge => {
    // Only show edges on the focus BFS tree: an edge is shown if both endpoints
    // are visible AND their depths differ by ≤1 (parent→child in BFS).
    // This prevents showing all cross-edges between visible nodes (spaghetti).
    const edgeInFocus = !focusNodeDepths || (() => {
      const sd = focusNodeDepths.get(edge.source);
      const td = focusNodeDepths.get(edge.target);
      if (sd === undefined || td === undefined) return false;
      return Math.abs(sd - td) <= 1;
    })();

    // Compute edge depth = max depth of its two endpoints in focus BFS
    let focusEdgeDepth: number | undefined;
    if (focusNodeDepths && edgeInFocus) {
      const srcDepth = focusNodeDepths.get(edge.source) ?? 999;
      const tgtDepth = focusNodeDepths.get(edge.target) ?? 999;
      focusEdgeDepth = Math.max(srcDepth, tgtDepth);
    }

    // Dynamic marker color based on edge type
    const isCycleEdge = cycleEdgeSet.has(`${edge.source}->${edge.target}`);
    const isGhostEdge = edge.data?.isGhostEdge ?? false;
    const markerColor = isGhostEdge ? '#ef4444'
      : isCycleEdge ? COLORS.violation
      : focusEdgeDepth !== undefined ? (focusEdgeDepth <= 1 ? '#f97316' : '#64748b')
      : '#3b82f680';

    return {
      ...edge,
      className: focusVisibleNodes ? (edgeInFocus ? 'focus-active' : 'focus-dimmed') : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: markerColor },
      data: {
        ...edge.data,
        isCycleEdge,
        focusEdgeDepth,
        isCouplingMode: layoutMode === 'force-directed',
        isGhostEdge,
      },
    };
  });

  useEffect(() => {
    postMessage({ type: 'webviewReady' });
  }, []);

  // Reliable fitView after every layout change
  const prevLayoutKeyRef = useRef('');
  useEffect(() => {
    const key = `${layoutNodes.length}:${layoutClusters.length}:${layoutNodes.slice(0, 5).map(n => `${n.id}@${Math.round(n.position.x)},${Math.round(n.position.y)}`).join('|')}`;
    if (key === prevLayoutKeyRef.current || key === '0:0:') return;
    prevLayoutKeyRef.current = key;

    const totalNodes = layoutNodes.length + layoutClusters.length;
    const padding = totalNodes > 80 ? 0.08 : totalNodes > 30 ? 0.15 : 0.25;

    // Delay fitView to allow CSS node transitions (350ms) to complete first
    const doFit = () => fitView({ padding, duration: 500 });

    setTimeout(doFit, 400);
    if (totalNodes > 50) {
      setTimeout(doFit, 900);
    }
    if (totalNodes > 200) {
      setTimeout(doFit, 1500);
    }
  }, [layoutNodes, layoutClusters, fitView]);

  // Auto-zoom to focused nodes (files + clusters) when focus mode activates
  useEffect(() => {
    if (!focusNodeId || !focusVisibleNodes) return;
    const focusedNodeObjects = [
      ...layoutNodes.filter(n => focusVisibleNodes.has(n.id)).map(n => ({ id: n.id })),
      ...layoutClusters.filter(c => focusVisibleNodes.has(c.id)).map(c => ({ id: c.id })),
    ];
    if (focusedNodeObjects.length === 0) return;
    setTimeout(() => {
      fitView({ nodes: focusedNodeObjects, padding: 0.2, duration: 500 });
    }, 100);
  }, [focusNodeId, focusVisibleNodes, layoutNodes, layoutClusters, fitView]);

  // No auto-collapse — always start expanded

  const toggleClusterCollapse = useCallback((folder: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }, []);

  // Toast state for orphan click feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Show toast on live graph update
  useEffect(() => {
    if (lastUpdateTs > 0) {
      showToast(`Graph updated — ${stats?.fileCount ?? 0} files, ${stats?.edgeCount ?? 0} deps`);
    }
  }, [lastUpdateTs]);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    // Ignore clicks on focus-dimmed nodes (they should not be interactive)
    if (node.className === 'focus-dimmed') return;
    if (node.type === 'cluster') {
      // Single click on cluster → focus radial + auto-expand this cluster
      const folder = (node.data as any).folder as string;
      const clusterFileIds = folderFilesRef.current.get(folder);
      // Count cross-cluster edges for this cluster
      let crossEdges = 0;
      if (clusterFileIds) {
        for (const e of edges) {
          if ((clusterFileIds.has(e.source) && !clusterFileIds.has(e.target)) ||
              (!clusterFileIds.has(e.source) && clusterFileIds.has(e.target))) {
            crossEdges++;
          }
        }
      }
      if (crossEdges < 2) {
        showToast(`${folder}/ — too few connections for focus`);
        return;
      }
      setFocusNodeId(prev => {
        if (prev === node.id) return null; // toggle off
        // Auto-expand the focused cluster (only if > 2 files)
        if (folder && (node.data as any).fileCount > 2) {
          setCollapsedFolders(cf => {
            if (!cf.has(folder)) return cf;
            const next = new Set(cf);
            next.delete(folder);
            return next;
          });
        }
        return node.id;
      });
      lockedNodeRef.current = null;
      clearHighlight();
      suppressHoverUntilRef.current = Date.now() + 500;
      return;
    }
    setShowOnboarding(false);
    const data = node.data as WebviewNodeData;
    setSelectedNodeData(data);
    onNodeHover(node.id);

    // Count edges for this file
    const edgeCount = edges.filter(e => e.source === node.id || e.target === node.id).length;
    if (edgeCount === 0) {
      showToast('Isolated file — no dependencies detected');
    } else if (edgeCount < 2) {
      showToast('Too few connections for focus');
    } else {
      setFocusNodeId(prev => prev === node.id ? null : node.id);
    }
    postMessage({ type: 'openFile', payload: { filePath: data.filePath } });
  }, [onNodeHover, edges, showToast]);

  const generateReport = useCallback(() => {
    postMessage({ type: 'generateReport' });
  }, []);

  const copyPrompt = useCallback((issueIndex: number) => {
    postMessage({ type: 'copyPrompt', payload: { issueIndex } });
    showToast('Fix prompt copied to clipboard');
  }, [showToast]);

  const toggleCategory = useCallback((category: FileCategory) => {
    setHiddenCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const toggleSemanticFilter = useCallback((key: 'showTests' | 'showConfigs' | 'showAssets') => {
    setSemanticFilters(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const onNodeDoubleClick: NodeMouseHandler = useCallback((_event, node) => {
    if (node.type === 'cluster') {
      const data = node.data as any;
      const folder = data.folder as string;
      // Don't expand tiny clusters (≤2 files) — they stay as pills
      if (folder && data.fileCount > 2) {
        toggleClusterCollapse(folder);
      }
      lockedNodeRef.current = null;
      clearHighlight();
      suppressHoverUntilRef.current = Date.now() + 500;
    }
  }, [toggleClusterCollapse]);

  const onSearchFocusResult = useCallback((nodeId: string) => {
    fitView({ nodes: [{ id: nodeId }], padding: 0.5, duration: 400 });
  }, [fitView]);

  const onSearchHighlight = useCallback((nodeIds: Set<string>) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedNodes(nodeIds);
    if (nodeIds.size > 0) {
      highlightTimerRef.current = setTimeout(() => setHighlightedNodes(new Set()), 8000);
    }
  }, []);

  const onEdgeClick: EdgeMouseHandler = useCallback((_event, edge) => {
    fitView({ nodes: [{ id: edge.source }, { id: edge.target }], padding: 0.4, duration: 400 });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedNodes(new Set([edge.source, edge.target]));
    highlightTimerRef.current = setTimeout(() => setHighlightedNodes(new Set()), 1500);
  }, [fitView]);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'grid',
      gridTemplateColumns: sidebarCollapsed ? '1fr 36px' : '1fr 210px',
      gridTemplateRows: '44px 1fr 30px',
      overflow: 'hidden',
      background: COLORS.bg,
    }}>
      {/* Top bar - full width */}
      <div style={{ gridColumn: '1 / -1' }}>
        <TopBar
          stats={stats}
          detections={detections}
          semanticFilters={semanticFilters}
          onToggleSemanticFilter={toggleSemanticFilter}
          totalFileCount={nodes.length}
          visibleFileCount={nodes.filter(n => {
            const d = n.data as WebviewNodeData;
            if (hiddenCategories.has(d.category)) return false;
            if (!semanticFilters.showTests && d.category === 'test') return false;
            if (!semanticFilters.showConfigs && d.category === 'config') return false;
            if (!semanticFilters.showAssets && ASSET_EXTENSIONS.has(d.extension)) return false;
            return true;
          }).length}
          focusActive={focusNodeId !== null}
          focusDepth={focusDepth}
          onFocusDepthChange={setFocusDepth}
          layoutMode={layoutMode}
          onToggleLayoutMode={() => { /* Couplage mode removed */ }}
        />
      </div>

      {/* Graph area */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <ReactFlow
          nodes={styledNodes}
          edges={styledEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onEdgeClick={onEdgeClick}
          fitView
          fitViewOptions={{ padding: nodes.length > 80 ? 0.08 : 0.25 }}
          minZoom={0.02}
          maxZoom={2}
          nodesDraggable={false}
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
          style={{ background: COLORS.bg }}
          onViewportChange={(vp) => {
            const newLod = vp.zoom < 0.25 ? 'minimal' : vp.zoom < 0.6 ? 'compact' : vp.zoom < 0.8 ? 'reduced' : 'full';
            if (newLod === currentLodRef.current) return;
            currentLodRef.current = newLod;
            const container = document.querySelector('.react-flow');
            if (container) container.setAttribute('data-lod', newLod);
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={COLORS.dotGrid} />
          <Controls
            style={{
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          />
          <MiniMap
            nodeStrokeWidth={3}
            nodeColor={(node) => {
              if (node.type === 'cluster') return '#1e293b';
              const cat = (node.data as WebviewNodeData).category;
              return CATEGORY_COLORS[cat] ?? '#6b7280';
            }}
            maskColor="rgba(10, 14, 23, 0.85)"
            style={{
              background: COLORS.bgPanel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              marginLeft: 38,
            }}
            zoomable
            pannable
            position="bottom-left"
          />
        </ReactFlow>

        {/* Search bar */}
        <div style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 5,
        }}>
          <SearchBar
            nodes={nodes}
            onFocusResult={onSearchFocusResult}
            onHighlight={onSearchHighlight}
          />
        </div>

        {/* Onboarding tooltip */}
        {showOnboarding && nodes.length > 0 && (
          <div
            onClick={() => setShowOnboarding(false)}
            style={{
              position: 'absolute',
              bottom: 50,
              left: '50%',
              transform: 'translateX(-50%)',
              background: `${COLORS.bgCard}ee`,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: '10px 18px',
              color: COLORS.textDim,
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              zIndex: 5,
              cursor: 'pointer',
              backdropFilter: 'blur(4px)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px 20px',
            }}
          >
            <span><span style={{ color: '#3b82f6', marginRight: 6 }}>hover</span>See connections</span>
            <span><span style={{ color: '#f97316', marginRight: 6 }}>click</span>Focus mode</span>
            <span><span style={{ color: '#10b981', marginRight: 6 }}>Ctrl+F</span>Search files</span>
            <span><span style={{ color: '#ef4444', marginRight: 6 }}>Esc</span>Exit focus</span>
          </div>
        )}

        {/* Exit Focus — rendered inside bottom-right button bar below */}

        {/* Toast overlay for orphan/isolated file click */}
        {toastMessage && (
          <div style={{
            position: 'absolute',
            bottom: 50,
            left: '50%',
            transform: 'translateX(-50%)',
            background: COLORS.bgCard,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: '8px 16px',
            color: COLORS.textMuted,
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            zIndex: 10,
            animation: 'fadeIn 0.2s ease',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}>
            {toastMessage}
          </div>
        )}

        {/* Bottom-right action bar: Exit Focus + Export + Expand/Collapse */}
        <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', gap: 6, zIndex: 5 }}>
          {focusNodeId && (
            <button
              onClick={() => setFocusNodeId(null)}
              style={{
                background: COLORS.violation, border: 'none', borderRadius: 6,
                padding: '6px 12px', color: '#fff', fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold', cursor: 'pointer',
              }}
            >Exit Focus</button>
          )}
          <button
            onClick={() => fitView({ padding: 0.15, duration: 300 })}
            title="Fit graph to viewport"
            style={{
              background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 6,
              padding: '6px 10px', color: COLORS.textDim, fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', transition: 'background 0.15s ease',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = COLORS.border; }}
            onMouseLeave={e => { e.currentTarget.style.background = COLORS.bgCard; }}
          >
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
            </svg>
            Fit
          </button>
          <button
            onClick={exportPng}
            title="Export graph as PNG"
            style={{
              background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 6,
              padding: '6px 12px', color: COLORS.textDim, fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', transition: 'background 0.15s ease',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = COLORS.border; }}
            onMouseLeave={e => { e.currentTarget.style.background = COLORS.bgCard; }}
          >
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 14h8M8 2v9M5 8l3 3 3-3" />
            </svg>
            Export
          </button>
          {collapsedFolders.size > 0 && (
            <button
              onClick={() => setCollapsedFolders(new Set())}
              style={{
                background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 6,
                padding: '6px 12px', color: COLORS.textDim, fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = COLORS.border; }}
              onMouseLeave={e => { e.currentTarget.style.background = COLORS.bgCard; }}
            >Expand all</button>
          )}
          {collapsedFolders.size === 0 && nodes.length > 0 && (
            <button
              onClick={() => {
                const folderCounts = new Map<string, number>();
                for (const n of nodes) {
                  const folder = (n.data as WebviewNodeData).folder;
                  folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1);
                }
                const small = new Set<string>();
                for (const [folder, count] of folderCounts) {
                  if (count <= 3) small.add(folder);
                }
                setCollapsedFolders(small);
              }}
              style={{
                background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 6,
                padding: '6px 12px', color: COLORS.textDim, fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = COLORS.border; }}
              onMouseLeave={e => { e.currentTarget.style.background = COLORS.bgCard; }}
            >Collapse small</button>
          )}
        </div>
      </div>

      {/* Right sidebar */}
      <Sidebar
        detections={detections}
        selectedNode={selectedNodeData}
        allNodes={nodes.map(n => n.data as WebviewNodeData)}
        edges={styledEdges}
        onCopyPrompt={copyPrompt}
        onGenerateReport={generateReport}
        onNavigateToFile={(fileId) => {
          fitView({ nodes: [{ id: fileId }], padding: 0.5, duration: 400 });
          setHighlightedNodes(new Set([fileId]));
          if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
          highlightTimerRef.current = setTimeout(() => setHighlightedNodes(new Set()), 2000);
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        onDeselectNode={() => { setSelectedNodeData(null); setFocusNodeId(null); }}
        onHighlightFiles={(fileIds) => {
          if (fileIds.length === 0) {
            setHighlightedNodes(new Set());
            return;
          }
          setHighlightedNodes(new Set(fileIds));
          if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
          highlightTimerRef.current = setTimeout(() => setHighlightedNodes(new Set()), 15000);
        }}
      />

      {/* Bottom legend - full width */}
      <div style={{ gridColumn: '1 / -1' }}>
        <Legend hiddenCategories={hiddenCategories} onToggleCategory={toggleCategory} />
      </div>
    </div>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <style>{globalStyles}</style>
      <GraphCanvas />
    </ReactFlowProvider>
  );
}
