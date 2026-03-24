import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { COLORS, CATEGORY_COLORS, FONT } from '../utils/colors.js';
import type { FileCategory } from '../../shared/protocol.js';

export type ClusterHealth = 'clean' | 'warning' | 'critical';

export interface ClusterNodeData {
  folder: string;
  fileCount: number;
  inEdgeCount: number;
  outEdgeCount: number;
  collapsed: boolean;
  clusterWidth: number;
  clusterHeight: number;
  dominantCategory?: FileCategory;
  healthStatus?: ClusterHealth;
  issueCount?: number;
  onToggle?: (folder: string) => void;
}

type ClusterNodeProps = NodeProps & {
  data: ClusterNodeData;
};

const HEALTH_COLORS: Record<ClusterHealth, string> = {
  clean: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
};

function ClusterNodeComponent({ data }: ClusterNodeProps) {
  const isCollapsed = data.collapsed;
  const isSmall = isCollapsed && data.fileCount <= 2;
  const w = isCollapsed ? data.clusterWidth : data.clusterWidth;
  const h = isCollapsed ? data.clusterHeight : data.clusterHeight;
  const folderName = data.folder === '.' ? '/' : data.folder.split('/').pop() ?? data.folder;
  const health = data.healthStatus ?? 'clean';
  const clusterColor = HEALTH_COLORS[health];

  return (
    <>
    <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none', width: 1, height: 1, left: '50%', top: '50%' }} />
    <div
      className="depsview-cluster"
      style={{
        width: w,
        height: h,
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      {/* Background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: isCollapsed
          ? (isSmall ? `${clusterColor}0c` : `${clusterColor}18`)
          : `${clusterColor}0a`,
        border: isCollapsed
          ? (isSmall ? `1px solid ${clusterColor}40` : `2px solid ${clusterColor}70`)
          : `2px dashed ${clusterColor}50`,
        borderRadius: isSmall ? 6 : 10,
        boxShadow: isCollapsed && !isSmall
          ? `inset 0 0 20px ${clusterColor}15, 0 2px 8px ${clusterColor}10`
          : 'none',
      }} />

      {/* Issue badge — top right corner */}
      {data.issueCount != null && data.issueCount > 0 && (
        <div style={{
          position: 'absolute',
          top: isCollapsed ? -6 : -22,
          right: -6,
          background: HEALTH_COLORS[health],
          color: '#fff',
          fontSize: 8,
          fontFamily: FONT,
          fontWeight: 'bold',
          width: 18,
          height: 18,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
          boxShadow: `0 0 6px ${HEALTH_COLORS[health]}60`,
        }}>
          {data.issueCount}
        </div>
      )}

      {/* Category bar at bottom (big collapsed clusters only) */}
      {isCollapsed && !isSmall && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          borderRadius: '0 0 10px 10px',
          background: `linear-gradient(90deg, ${clusterColor}90 0%, ${clusterColor}30 100%)`,
        }} />
      )}

      {/* Collapsed state: compact pill for small, full for big */}
      {isCollapsed && isSmall && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          gap: 6,
          color: COLORS.textDim,
          fontFamily: FONT,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: clusterColor, flexShrink: 0, opacity: 0.7 }} />
          <span style={{ fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {folderName}/
          </span>
          <span style={{ fontSize: 8, color: COLORS.textMuted, flexShrink: 0 }}>{data.fileCount}</span>
        </div>
      )}
      {isCollapsed && !isSmall && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          gap: 10,
          color: COLORS.text,
          fontFamily: FONT,
        }}>
          <svg width={16} height={13} viewBox="0 0 20 16" fill="none" style={{ flexShrink: 0 }}>
            <path d="M1 3C1 2 2 1 3 1H7L9.5 4H17C18 4 19 5 19 6V13C19 14 18 15 17 15H3C2 15 1 14 1 13V3Z"
              fill={clusterColor} opacity={0.9} />
          </svg>
          <span style={{ fontWeight: 'bold', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {folderName}/
          </span>
          <span style={{ color: COLORS.textDim, fontSize: 9, flexShrink: 0 }}>
            {data.fileCount}f · {data.inEdgeCount + data.outEdgeCount}↔
          </span>
        </div>
      )}

      {/* Folder tab label — centered on card, hidden for small collapsed clusters */}
      {!(isCollapsed && isSmall) && <div
        style={{
          position: 'absolute',
          top: -18,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          pointerEvents: 'auto',
          cursor: 'pointer',
          padding: '4px 10px',
          userSelect: 'none' as const,
          background: `${clusterColor}25`,
          border: `2px solid ${clusterColor}50`,
          borderBottom: 'none',
          borderRadius: '8px 8px 0 0',
          overflow: 'hidden',
        }}
      >
        {/* Folder icon — tabbed style */}
        <svg width={20} height={16} viewBox="0 0 20 16" fill="none">
          <path d="M1 3C1 2 2 1 3 1H7L9.5 4H17C18 4 19 5 19 6V13C19 14 18 15 17 15H3C2 15 1 14 1 13V3Z"
            fill={clusterColor} opacity={0.85} />
        </svg>

        {/* Folder name */}
        <span style={{
          color: '#fff',
          fontSize: 12,
          fontFamily: FONT,
          fontWeight: 'bold',
          letterSpacing: 0.3,
          textShadow: `0 1px 4px ${clusterColor}90`,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
          {folderName}/
        </span>

        {/* Counts pill */}
        <span style={{
          color: COLORS.text,
          fontSize: 10,
          fontFamily: FONT,
          background: `${COLORS.bg}90`,
          padding: '2px 6px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {data.fileCount}
          {data.inEdgeCount > 0 && ` · ${data.inEdgeCount}`}
        </span>
      </div>}
    </div>
    <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none', width: 1, height: 1, left: '50%', top: '50%' }} />
    </>
  );
}

export const ClusterNode = memo(ClusterNodeComponent);
