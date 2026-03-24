import React, { memo } from 'react';
import { BaseEdge, getStraightPath, type EdgeProps } from '@xyflow/react';
import type { WebviewEdgeData } from '../../shared/protocol.js';
import { COLORS, FONT } from '../utils/colors.js';

type DependencyEdgeProps = EdgeProps & {
  data: WebviewEdgeData & { isCycleEdge?: boolean; focusEdgeDepth?: number; isCouplingMode?: boolean; isGhostEdge?: boolean };
};

const EDGE_COLORS: Record<string, string> = {
  static: '#3b82f6',
  dynamic: '#10b981',
  require: '#9ca3af',
};

function DependencyEdgeComponent({
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  data,
  markerEnd,
  source,
}: DependencyEdgeProps) {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX, sourceY,
    targetX, targetY,
  });

  const isCycle = data?.isCycleEdge ?? false;
  const isDynamic = data?.kind === 'dynamic';
  const isClusterEdge = source?.startsWith('cluster:');
  const isCouplingMode = data?.isCouplingMode ?? false;
  const isGhost = data?.isGhostEdge ?? false;
  const focusDepthRaw2 = data?.focusEdgeDepth;
  // Focus mode: distinct colors per depth level
  // Depth 1 (direct) = bright orange, Depth 2 (indirect) = muted blue-gray
  const color = isGhost ? '#ef4444'
    : isCycle ? COLORS.violation
    : focusDepthRaw2 !== undefined ? (focusDepthRaw2 <= 1 ? '#f97316' : '#64748b')
    : (EDGE_COLORS[data?.kind ?? 'static'] ?? '#3b82f6');

  // Adaptive stroke width based on specifier count + focus depth
  const specCount = data?.specifierCount ?? 1;
  const focusDepthRaw = data?.focusEdgeDepth;
  const strokeWidth = isCycle ? 2
    : isClusterEdge && isCouplingMode ? Math.min(4, Math.max(0.5, specCount * 0.5))
    : isClusterEdge ? Math.min(4, 1.5 + specCount * 0.15)
    : focusDepthRaw !== undefined ? (focusDepthRaw <= 1 ? 1 : 0.4)
    : Math.min(2, 0.8 + specCount * 0.15);

  // Heat-aware: edges connected to recently modified files glow brighter
  const edgeHeat = Math.max(data?.sourceHeat ?? 0, data?.targetHeat ?? 0);
  const heatBoost = edgeHeat > 0.5 ? 0.25 : edgeHeat > 0.1 ? 0.12 : 0;

  const focusDepth = data?.focusEdgeDepth;
  // Base opacity: hidden at rest (shown via .edge-highlighted on hover), bright in focus/cycle
  const opacity = isCycle ? 0.8
    : isGhost ? 0.6
    : focusDepth !== undefined ? (focusDepth <= 1 ? 0.25 : 0.03)
    : 0;

  // Dash pattern — deeper focus edges get dashed "ghost" lines
  let strokeDasharray: string | undefined;
  if (focusDepth !== undefined && focusDepth >= 2) strokeDasharray = '4 4';
  else if (isDynamic) strokeDasharray = '6 4';
  if (isGhost) strokeDasharray = '5 3';
  if (isCycle) strokeDasharray = '4 3';
  if (isClusterEdge) strokeDasharray = '8 4';

  return (
    <>
      {/* Glow underlay for cycles */}
      {isCycle && (
        <BaseEdge
          path={edgePath}
          style={{
            stroke: COLORS.violation,
            strokeWidth: strokeWidth * 2,
            opacity: 0.15,
            animation: 'edgePulse 1.1s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* No glow for cluster edges — they highlight on hover via CSS */}

      {/* Main edge */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={opacity > 0 ? 20 : 0}
        style={{
          stroke: color,
          strokeWidth,
          opacity,
          strokeDasharray,
          pointerEvents: opacity > 0 ? 'auto' : 'none',
        }}
      />

      {/* Cycle label */}
      {isCycle && (
        <foreignObject x={labelX - 24} y={labelY - 10} width={48} height={20} style={{ overflow: 'visible' }}>
          <div style={{
            background: COLORS.violation,
            color: '#fff',
            fontSize: 8,
            fontFamily: FONT,
            fontWeight: 'bold',
            textAlign: 'center',
            borderRadius: 4,
            padding: '2px 6px',
          }}>
            CYCLE
          </div>
        </foreignObject>
      )}

      {/* Ghost edge error badge */}
      {isGhost && (
        <foreignObject x={labelX - 8} y={labelY - 8} width={16} height={16} style={{ overflow: 'visible' }}>
          <div style={{
            background: '#ef4444',
            color: '#fff',
            fontSize: 9,
            fontFamily: FONT,
            fontWeight: 'bold',
            textAlign: 'center',
            borderRadius: '50%',
            width: 14,
            height: 14,
            lineHeight: '14px',
          }}>
            !
          </div>
        </foreignObject>
      )}

      {/* Count badge for cluster edges — visible in coupling mode, shown on hover otherwise */}
      {isClusterEdge && specCount > 1 && (
        <foreignObject className="edge-count-badge" x={labelX - 10} y={labelY - 8} width={20} height={16} style={{ overflow: 'visible', opacity: isCouplingMode ? 0.8 : 0, transition: 'opacity 0.2s' }}>
          <div style={{
            background: `${color}60`,
            color: '#fff',
            fontSize: 7,
            fontFamily: FONT,
            fontWeight: 'bold',
            textAlign: 'center',
            borderRadius: 3,
            padding: '1px 3px',
          }}>
            {specCount}
          </div>
        </foreignObject>
      )}

      {/* Specifier names — hidden by default, shown when edge is highlighted */}
      {!isClusterEdge && specCount > 0 && (
        <foreignObject className="edge-spec-label" x={labelX - 50} y={labelY + 6} width={100} height={30} style={{ overflow: 'visible', opacity: 0, transition: 'opacity 0.2s', pointerEvents: 'none' }}>
          <div style={{
            background: `${COLORS.bgCard}dd`,
            color: COLORS.text,
            fontSize: 7,
            fontFamily: FONT,
            textAlign: 'center',
            borderRadius: 3,
            padding: '2px 4px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 100,
          }}>
            {data?.specifiers?.slice(0, 3).join(', ')}{(data?.specifiers?.length ?? 0) > 3 ? ' ...' : ''}
          </div>
        </foreignObject>
      )}

      <style>{`
        @keyframes edgePulse {
          0%, 100% { opacity: 0.08; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </>
  );
}

export const DependencyEdge = memo(DependencyEdgeComponent);
