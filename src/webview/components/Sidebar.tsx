import React, { memo, useState } from 'react';
import type { DetectionsMessage, GraphDataMessage, WebviewNodeData, WebviewEdgeData, IssueType } from '../../shared/protocol.js';
import type { Edge } from '@xyflow/react';
import { COLORS, FONT, CATEGORY_COLORS } from '../utils/colors.js';

interface SidebarProps {
  detections: DetectionsMessage['payload'] | null;
  selectedNode: WebviewNodeData | null;
  allNodes: WebviewNodeData[];
  edges: Edge<WebviewEdgeData>[];
  onCopyPrompt: (issueIndex: number) => void;
  onGenerateReport: () => void;
  onNavigateToFile?: (fileId: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onDeselectNode?: () => void;
  onHighlightFiles?: (fileIds: string[]) => void;
}

/* ── Shared card wrapper ── */
const cardStyle = {
  background: COLORS.bg,
  borderRadius: 6,
  padding: '8px 9px',
} as const;

const sectionLabel = {
  fontSize: 8,
  color: COLORS.textMuted,
  fontFamily: FONT,
  textTransform: 'uppercase' as const,
  letterSpacing: 1.2,
  marginBottom: 5,
};

/* ── Issue Summary ── */
const PENALTY_CONFIG: Array<{ type: IssueType; label: string; color: string }> = [
  { type: 'cycle', label: 'Cycles', color: '#ef4444' },
  { type: 'phantom', label: 'Phantoms', color: '#f97316' },
  { type: 'shadow', label: 'Shadow', color: '#eab308' },
  { type: 'orphan', label: 'Orphans', color: '#8b5cf6' },
  { type: 'coupling', label: 'Coupling', color: '#06b6d4' },
];

function IssueSummary({ issues }: { issues?: Array<{ type: IssueType }> }) {
  const counts = issues ? PENALTY_CONFIG.map(cfg => ({
    ...cfg, count: issues.filter(i => i.type === cfg.type).length,
  })).filter(p => p.count > 0) : [];

  if (counts.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#10b981', fontSize: 14 }}>&#10003;</span>
        <span style={{ fontSize: 11, color: '#10b981', fontFamily: FONT, fontWeight: 600 }}>No issues</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {counts.map(c => (
        <div key={c.type} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 7px', borderRadius: 4,
          background: `${c.color}20`, border: `1px solid ${c.color}40`,
        }}>
          <span style={{ fontSize: 11, color: c.color, fontFamily: FONT, fontWeight: 700 }}>{c.count}</span>
          <span style={{ fontSize: 8, color: COLORS.textDim, fontFamily: FONT }}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Project Summary ── */
function ProjectSummary({ nodes, edges }: { nodes: WebviewNodeData[]; edges: Edge<WebviewEdgeData>[] }) {
  if (nodes.length === 0) {
    return <div style={{ padding: 12, textAlign: 'center', color: COLORS.textDim, fontFamily: FONT, fontSize: 10 }}>Loading...</div>;
  }

  const catCounts = new Map<string, number>();
  for (const n of nodes) catCounts.set(n.category, (catCounts.get(n.category) ?? 0) + 1);

  const inDegree = new Map<string, number>();
  for (const e of edges) inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  const topImported = [...inDegree.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={sectionLabel}>Overview</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {[...catCounts.entries()].sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
          const color = CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS] ?? '#6b7280';
          return (
            <div key={cat} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 6px', borderRadius: 3,
              background: `${color}15`, border: `1px solid ${color}30`,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: FONT }}>{count}</span>
              <span style={{ fontSize: 7.5, color: COLORS.textMuted, fontFamily: FONT }}>{cat}</span>
            </div>
          );
        })}
      </div>

      {topImported.length > 0 && (<>
        <div style={{ ...sectionLabel, marginBottom: 2, marginTop: 2 }}>Most imported</div>
        {topImported.map(([file, count]) => (
          <div key={file} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, fontFamily: FONT, color: COLORS.text }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{file.split('/').pop()}</span>
            <span style={{ color: COLORS.textMuted, flexShrink: 0, fontSize: 9 }}>{count}</span>
          </div>
        ))}
      </>)}
    </div>
  );
}

/* ── File List (Depends on / Used by) ── */
function FileList({ label, files, color, onNavigateToFile }: {
  label: string; files: string[]; color: string; onNavigateToFile?: (fileId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (files.length === 0) return null;

  return (
    <div style={{ background: `${color}08`, borderRadius: 4, padding: '5px 7px', border: `1px solid ${color}15` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}>
        <span style={{ fontSize: 8, color: COLORS.textDim, fontFamily: FONT }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 12, color, fontFamily: FONT, fontWeight: 700 }}>{files.length}</span>
          <span style={{ fontSize: 7, color: COLORS.textMuted }}>{expanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 100, overflowY: 'auto' }}>
          {files.map((file, i) => (
            <div key={i} onClick={() => onNavigateToFile?.(file)}
              style={{
                fontSize: 8.5, fontFamily: FONT, color: COLORS.text, padding: '2px 4px',
                borderRadius: 3, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `${color}25`; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              title={file}
            >{file.split('/').pop()}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Node Info ── */
function NodeInfo({ node, edges, onNavigateToFile, onDeselect }: { node: WebviewNodeData | null; edges: Edge<WebviewEdgeData>[]; onNavigateToFile?: (fileId: string) => void; onDeselect?: () => void }) {
  if (!node) return null;

  const fileName = node.relativePath.split('/').pop() ?? node.relativePath;
  const typeColor = CATEGORY_COLORS[node.category] ?? '#6b7280';

  const depFiles = edges.filter(e => e.source === node.relativePath || e.source === node.filePath).map(e => e.target);
  const dependentFiles = edges.filter(e => e.target === node.relativePath || e.target === node.filePath).map(e => e.source);

  const reverseAdj = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = reverseAdj.get(edge.target) ?? [];
    targets.push(edge.source);
    reverseAdj.set(edge.target, targets);
  }
  let directCount = 0, indirectCount = 0, farCount = 0;
  const visited = new Set<string>([node.relativePath, node.filePath]);
  let current = [node.relativePath, node.filePath];
  for (let depth = 1; depth <= 3; depth++) {
    const next: string[] = [];
    for (const c of current) {
      for (const pred of reverseAdj.get(c) ?? []) {
        if (!visited.has(pred)) { visited.add(pred); next.push(pred);
          if (depth === 1) directCount++; else if (depth === 2) indirectCount++; else farCount++;
        }
      }
    }
    current = next;
  }

  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 7 }}>
      {/* File header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <svg width={20} height={24} viewBox="0 0 22 26">
          <path d="M 2 0 L 14 0 L 20 6 L 20 24 Q 20 26 18 26 L 2 26 Q 0 26 0 24 L 0 2 Q 0 0 2 0 Z" fill={COLORS.bgCard} stroke={typeColor} strokeWidth={1.2} />
          <path d="M 14 0 L 14 6 L 20 6" fill={`${typeColor}20`} stroke={typeColor} strokeWidth={0.8} />
        </svg>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, color: COLORS.text, fontFamily: FONT, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
          <div style={{ fontSize: 8, color: typeColor, fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={node.relativePath}>
            {node.relativePath.replace(/\/[^/]+$/, '/')}</div>
        </div>
        {onDeselect && (
          <div onClick={onDeselect} style={{
            cursor: 'pointer', fontSize: 11, color: COLORS.textMuted, width: 18, height: 18, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3,
          }}
            onMouseEnter={e => { e.currentTarget.style.color = COLORS.text; e.currentTarget.style.background = COLORS.border; }}
            onMouseLeave={e => { e.currentTarget.style.color = COLORS.textMuted; e.currentTarget.style.background = 'transparent'; }}
            title="Back to overview"
          >{'\u00d7'}</div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {[
          { label: 'Exports', value: node.exportCount },
          { label: 'Imports', value: node.importCount },
        ].map((s, i) => (
          <div key={i} style={{ background: COLORS.bgPanel, borderRadius: 4, padding: '3px 6px' }}>
            <div style={{ fontSize: 7.5, color: COLORS.textDim, fontFamily: FONT }}>{s.label}</div>
            <div style={{ fontSize: 12, color: COLORS.text, fontFamily: FONT, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <FileList label="Depends on" files={depFiles} color="#3b82f6" onNavigateToFile={onNavigateToFile} />
      <FileList label="Used by" files={dependentFiles} color="#10b981" onNavigateToFile={onNavigateToFile} />

      {/* Complexity */}
      {node.fileSize != null && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, fontFamily: FONT, color: COLORS.textDim }}>
            <span>{node.fileSize < 1024 ? `${node.fileSize} B` : `${(node.fileSize / 1024).toFixed(1)} KB`}</span>
            {node.complexity && <span>ratio {(node.complexity.exportRatio * 100).toFixed(0)}%</span>}
          </div>
          <div style={{ marginTop: 3, height: 3, background: COLORS.border, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: node.fileSize > 10240 ? '#ef4444' : node.fileSize > 5120 ? '#f59e0b' : '#10b981',
              width: `${Math.min(100, (node.fileSize / 10240) * 100)}%`,
            }} />
          </div>
        </div>
      )}

      {/* Impact radius */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { color: COLORS.impact1, count: directCount, label: 'dir' },
          { color: COLORS.impact2, count: indirectCount, label: 'ind' },
          { color: COLORS.impact3, count: farCount, label: 'far' },
        ].filter(r => r.count > 0).map((r, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.color, display: 'inline-block' }} />
            <span style={{ fontSize: 8.5, color: COLORS.text, fontFamily: FONT }}>{r.count} {r.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Detection Panel ── */
const TYPE_ICONS: Record<IssueType, string> = {
  cycle: '\u26A0', phantom: '\uD83D\uDC7B', shadow: '\uD83D\uDD0D', orphan: '\uD83D\uDD17', coupling: '\u2194',
};
const TYPE_LABELS: Record<IssueType, string> = {
  cycle: 'Circular dep', phantom: 'Phantom', shadow: 'Shadow import', orphan: 'Orphan', coupling: 'High coupling',
};

function CycleDetail({ issue, index, onCopyPrompt }: { issue: DetectionsMessage['payload']['issues'][0]; index: number; onCopyPrompt: (i: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const c = COLORS.violation;
  return (
    <div style={{ padding: '5px 7px', background: `${c}0a`, border: `1px solid ${c}20`, borderRadius: 4, cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.background = `${c}15`; }}
      onMouseLeave={e => { e.currentTarget.style.background = `${c}0a`; }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setExpanded(!expanded)}>
        <span style={{ fontSize: 11 }}>{TYPE_ICONS.cycle}</span>
        <span style={{ fontSize: 9, color: c, fontFamily: FONT, fontWeight: 700, flex: 1 }}>{TYPE_LABELS.cycle}</span>
        <span style={{ fontSize: 7, color: COLORS.textMuted }}>{expanded ? '\u25B2' : '\u25BC'} {issue.filePaths.length}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 4, marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {issue.filePaths.map((fp, fi) => (
            <div key={fi} style={{ fontSize: 8.5, color: COLORS.text, fontFamily: FONT, display: 'flex', gap: 3 }}>
              <span style={{ color: c }}>{fi < issue.filePaths.length - 1 ? '\u2192' : '\u21BA'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fp.split('/').pop()}</span>
            </div>
          ))}
          <span onClick={(e) => { e.stopPropagation(); onCopyPrompt(index); }}
            style={{ fontSize: 7.5, color: COLORS.borderActive, fontFamily: FONT, cursor: 'pointer', marginTop: 2 }}>copy fix</span>
        </div>
      )}
    </div>
  );
}

const TYPE_ORDER: IssueType[] = ['cycle', 'phantom', 'shadow', 'orphan', 'coupling'];
const TYPE_COLORS_MAP: Record<IssueType, string> = {
  cycle: '#ef4444', phantom: '#f97316', shadow: '#eab308', orphan: '#8b5cf6', coupling: '#06b6d4',
};
const MAX_VISIBLE = 8;

function DetectionGroup({ type, issues, startIndex, onCopyPrompt, onNavigateToFile, onHighlightFiles }: {
  type: IssueType;
  issues: Array<{ issue: DetectionsMessage['payload']['issues'][0]; originalIndex: number }>;
  startIndex: number;
  onCopyPrompt: (i: number) => void;
  onNavigateToFile?: (fileId: string) => void;
  onHighlightFiles?: (fileIds: string[]) => void;
}) {
  const isCritical = type === 'cycle' || type === 'phantom';
  const [expanded, setExpanded] = useState(isCritical);
  const [showAll, setShowAll] = useState(false);
  const c = TYPE_COLORS_MAP[type];
  const visible = showAll ? issues : issues.slice(0, MAX_VISIBLE);

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && onHighlightFiles) {
      const allFiles = issues.flatMap(({ issue }) => issue.filePaths);
      onHighlightFiles(allFiles);
    } else if (!next && onHighlightFiles) {
      onHighlightFiles([]);
    }
  };

  return (
    <div style={{ borderRadius: 4, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '4px 7px',
        background: `${c}0a`, cursor: 'pointer', borderRadius: expanded ? '4px 4px 0 0' : 4,
        border: `1px solid ${c}18`,
      }}
        onClick={toggleExpand}>
        <span style={{ fontSize: 10 }}>{TYPE_ICONS[type]}</span>
        <span style={{ fontSize: 9, color: c, fontFamily: FONT, fontWeight: 700, flex: 1 }}>{TYPE_LABELS[type]}</span>
        <span style={{ fontSize: 10, color: c, fontFamily: FONT, fontWeight: 700 }}>{issues.length}</span>
        <span style={{ fontSize: 7, color: COLORS.textMuted }}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>
      {expanded && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 1, padding: '3px 5px',
          background: `${c}05`, borderLeft: `1px solid ${c}18`, borderRight: `1px solid ${c}18`, borderBottom: `1px solid ${c}18`,
          borderRadius: '0 0 4px 4px', maxHeight: 180, overflowY: 'auto',
        }}>
          {visible.map(({ issue, originalIndex }, vi) => {
            if (issue.type === 'cycle') return <CycleDetail key={vi} issue={issue} index={originalIndex} onCopyPrompt={onCopyPrompt} />;
            const filePath = issue.filePaths[0] ?? '';
            const fileName = filePath.split('/').pop() ?? filePath;
            return (
              <div key={vi} style={{
                padding: '3px 6px', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 5,
                cursor: 'pointer', fontSize: 8.5, fontFamily: FONT, color: COLORS.text,
              }}
                onClick={() => onNavigateToFile?.(filePath)}
                onMouseEnter={e => { e.currentTarget.style.background = `${c}15`; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                title={`${issue.message}\nClick to navigate · Right-click to copy fix`}
                onContextMenu={e => { e.preventDefault(); onCopyPrompt(originalIndex); }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{fileName}</span>
              </div>
            );
          })}
          {!showAll && issues.length > MAX_VISIBLE && (
            <div onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
              style={{ fontSize: 8, color: c, fontFamily: FONT, cursor: 'pointer', padding: '2px 6px', textAlign: 'center' }}>
              Show all ({issues.length})
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetectionPanel({ detections, onCopyPrompt, onNavigateToFile, onHighlightFiles }: {
  detections: DetectionsMessage['payload']; onCopyPrompt: (i: number) => void; onNavigateToFile?: (fileId: string) => void; onHighlightFiles?: (fileIds: string[]) => void;
}) {
  const grouped = new Map<IssueType, Array<{ issue: DetectionsMessage['payload']['issues'][0]; originalIndex: number }>>();
  detections.issues.forEach((issue, i) => {
    if (!grouped.has(issue.type)) grouped.set(issue.type, []);
    grouped.get(issue.type)!.push({ issue, originalIndex: i });
  });

  return (
    <div style={{ ...cardStyle, padding: '6px 7px', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 350, overflowY: 'auto' }}>
      <div style={sectionLabel}>Detections</div>
      {TYPE_ORDER.filter(t => grouped.has(t)).map(t => (
        <DetectionGroup key={t} type={t} issues={grouped.get(t)!} startIndex={0}
          onCopyPrompt={onCopyPrompt} onNavigateToFile={onNavigateToFile} onHighlightFiles={onHighlightFiles} />
      ))}
    </div>
  );
}

/* ── Collapsed rail ── */
function CollapsedRail({ detections, onToggle }: { detections: DetectionsMessage['payload'] | null; onToggle: () => void }) {
  const counts = detections ? PENALTY_CONFIG.map(cfg => ({
    ...cfg, count: detections.issues.filter(i => i.type === cfg.type).length,
  })).filter(p => p.count > 0) : [];

  return (
    <div style={{
      background: COLORS.bgPanel, borderLeft: `1px solid ${COLORS.border}`,
      width: 36, display: 'flex', flexDirection: 'column', alignItems: 'center',
      paddingTop: 8, gap: 6, fontFamily: FONT,
    }}>
      <div onClick={onToggle} style={{
        cursor: 'pointer', fontSize: 12, color: COLORS.textMuted, width: 24, height: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4,
        border: `1px solid ${COLORS.border}`,
      }}
        onMouseEnter={e => { e.currentTarget.style.background = COLORS.border; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        title="Expand sidebar"
      >{'\u2039'}</div>
      {counts.map(c => (
        <div key={c.type} title={`${c.count} ${c.label}`}
          style={{
            width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${c.color}20`, border: `1px solid ${c.color}30`,
            fontSize: 9, fontWeight: 700, color: c.color, fontFamily: FONT,
          }}>{c.count}</div>
      ))}
    </div>
  );
}

/* ── Main Sidebar ── */
function SidebarComponent({ detections, selectedNode, allNodes, edges, onCopyPrompt, onGenerateReport, onNavigateToFile, collapsed, onToggleCollapse, onDeselectNode, onHighlightFiles }: SidebarProps) {
  if (collapsed) {
    return <CollapsedRail detections={detections} onToggle={onToggleCollapse ?? (() => {})} />;
  }

  return (
    <div style={{
      background: COLORS.bgPanel,
      borderLeft: `1px solid ${COLORS.border}`,
      padding: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      overflowY: 'auto',
      fontFamily: FONT,
      width: 210,
    }}>
      {/* Toggle collapse button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {detections && <IssueSummary issues={detections.issues} />}
        <div onClick={onToggleCollapse} style={{
          cursor: 'pointer', fontSize: 12, color: COLORS.textMuted, width: 20, height: 20, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = COLORS.border; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          title="Collapse sidebar"
        >{'\u203A'}</div>
      </div>

      {selectedNode ? (
        <NodeInfo node={selectedNode} edges={edges} onNavigateToFile={onNavigateToFile} onDeselect={onDeselectNode} />
      ) : (
        <ProjectSummary nodes={allNodes} edges={edges} />
      )}

      {detections && detections.issues.length > 0 && (
        <DetectionPanel detections={detections} onCopyPrompt={onCopyPrompt} onNavigateToFile={onNavigateToFile} onHighlightFiles={onHighlightFiles} />
      )}

      <button onClick={onGenerateReport}
        onMouseEnter={e => { e.currentTarget.style.background = `${COLORS.borderActive}20`; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        style={{
          background: 'transparent', border: `1px solid ${COLORS.border}`, borderRadius: 4,
          padding: '4px 0', color: COLORS.textDim, fontFamily: FONT, fontSize: 8.5,
          cursor: 'pointer', letterSpacing: 0.5, marginTop: 'auto',
        }}>
        Generate Report
      </button>
    </div>
  );
}

export const Sidebar = memo(SidebarComponent);
