import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WebviewNodeData } from '../../shared/protocol.js';
import { CATEGORY_COLORS, COLORS, FONT } from '../utils/colors.js';
import { computeHeat } from '../utils/heatmap.js';

type FileNodeProps = NodeProps & {
  data: WebviewNodeData & {
    presenceScore?: number;
    focusDepthLevel?: number;
    impactLevel?: number;
    hasIssue?: boolean;
    description?: string;
    highlighted?: boolean;
    isNew?: boolean;
  };
};

const IMPACT_COLORS: Record<number, string> = {
  1: COLORS.impact1,
  2: COLORS.impact2,
  3: COLORS.impact3,
};

const HANDLE_STYLE = { background: 'transparent', border: 'none', width: 1, height: 1, left: '50%', top: '50%' } as const;

function FileNodeComponent({ data, selected }: FileNodeProps) {
  const color = CATEGORY_COLORS[data.category] ?? '#6b7280';
  const heat = computeHeat(data.lastModifiedMs);
  const fileName = data.relativePath.split('/').pop() ?? data.relativePath;
  const ext = data.extension.replace('.', '');
  const isOrphan = data.importCount === 0 && data.exportCount === 0;
  const impactColor = data.impactLevel ? IMPACT_COLORS[Math.min(data.impactLevel, 3)] : undefined;

  const ageMinutes = (Date.now() - data.lastModifiedMs) / 60_000;
  const heatLevel: 'hot' | 'warm' | 'cold' = ageMinutes < 5 ? 'hot' : ageMinutes < 60 ? 'warm' : 'cold';
  const touchedThisSession = ageMinutes < 60;

  const presence = data.presenceScore ?? 1.0;
  const hasPresenceAnchor = data.presenceScore !== undefined;
  const presenceOpacity = !hasPresenceAnchor ? (heat < 0.05 ? 0.8 : 0.75 + heat * 0.25)
    : presence >= 0.8 ? 1.0 : presence >= 0.5 ? 0.8 : presence >= 0.2 ? 0.6 : 0.35;
  const presenceScale = !hasPresenceAnchor ? 1.0 : presence >= 0.5 ? 1.0 : presence >= 0.2 ? 0.85 : 0.7;
  const showLabel = !hasPresenceAnchor || presence >= 0.2;
  const showStats = !hasPresenceAnchor || presence >= 0.5;

  // Scale node size by impact score: hub files appear slightly larger
  const sizeScale = data.impactScore >= 5 ? 1.25 : data.impactScore >= 2 ? 1.12 : 1;
  const w = Math.round(48 * sizeScale);
  const h = Math.round(56 * sizeScale);
  const fold = Math.round(12 * sizeScale);
  const rx = 4;

  return (
    <>
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />

      <div
        className={`depsview-filenode${data.isNew ? ' node-entered' : ''}`}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          width: 85, overflowX: 'clip',
          opacity: presenceOpacity,
          transform: presenceScale < 1 ? `scale(${presenceScale})` : undefined,
          cursor: presence >= 0.2 ? 'pointer' : 'default',
          pointerEvents: presence < 0.05 ? 'none' : undefined,
        }}>
        {isOrphan && (
          <div className="orphan-badge" style={{
            background: '#f59e0b', color: '#000', fontSize: 7, fontFamily: FONT,
            fontWeight: 'bold', padding: '1px 6px', borderRadius: 3, letterSpacing: 0.5, marginBottom: -2,
          }}>ORPHAN</div>
        )}

        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
          {/* Invisible hit area for hover detection */}
          <rect x={0} y={0} width={w} height={h} fill="transparent" />
          {/* Heat outline — CSS animation class instead of SVG animate */}
          {heatLevel === 'hot' && (
            <rect x={-6} y={-6} width={w + 12} height={h + 12}
              rx={rx + 3} fill="none" stroke={COLORS.hot} strokeWidth={2.5}
              strokeDasharray="6 4" className="heat-pulse" />
          )}
          {heatLevel === 'warm' && (
            <rect x={-5} y={-5} width={w + 10} height={h + 10}
              rx={rx + 3} fill="none" stroke={COLORS.warm} strokeWidth={2}
              opacity={0.7} style={{ filter: `drop-shadow(0 0 3px ${COLORS.warm}50)` }} />
          )}

          {/* Hover impact ring */}
          <rect className="impact-hover-ring"
            x={-8} y={-8} width={w + 16} height={h + 16} rx={rx + 4}
            fill="none" stroke={color} strokeWidth={2}
            strokeDasharray="8 5" opacity={0} style={{ pointerEvents: 'none' }} />

          {/* Highlight glow */}
          {data.highlighted && (
            <rect x={-6} y={-6} width={w + 12} height={h + 12} rx={rx + 3}
              fill="none" stroke={COLORS.borderActive} strokeWidth={2.5} opacity={0.8}
              style={{ animation: 'highlightPulse 1.5s ease-out forwards' }} />
          )}

          {/* Impact ring */}
          {impactColor && !selected && (
            <rect x={-7} y={-7} width={w + 14} height={h + 14} rx={rx + 4}
              fill="none" stroke={impactColor} strokeWidth={2}
              strokeDasharray="8 5" opacity={0.7}
              style={{ animation: 'dashRotate 4s linear infinite' }} />
          )}

          {/* Orphan dashed outline */}
          {isOrphan && (
            <rect x={-3} y={-3} width={w + 6} height={h + 6} rx={rx + 2}
              fill="none" stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="4 4" opacity={0.5} />
          )}

          {/* File body */}
          <path d={`M ${rx} 0 L ${w - fold} 0 L ${w} ${fold} L ${w} ${h - rx} Q ${w} ${h} ${w - rx} ${h} L ${rx} ${h} Q 0 ${h} 0 ${h - rx} L 0 ${rx} Q 0 0 ${rx} 0 Z`}
            fill={`${color}15`} stroke={color} strokeWidth={selected ? 2.5 : 2} />
          <path d={`M ${w - fold} 0 L ${w - fold} ${fold} L ${w} ${fold}`} fill={`${color}30`} stroke={color} strokeWidth={1} />

          {/* Extension badge */}
          <rect x={w - 20} y={h - 13} width={18} height={11} rx={2} fill={color} opacity={0.9} />
          <text x={w - 11} y={h - 5} textAnchor="middle" fill="#fff" fontSize={7} fontFamily={FONT} fontWeight="bold">{ext}</text>

          {/* Impact score badge */}
          {data.impactScore > 0 && (<g>
            <circle cx={w + 1} cy={-1} r={8} fill={COLORS.violation} />
            <text x={w + 1} y={2.5} textAnchor="middle" fill="#fff" fontSize={9} fontFamily={FONT} fontWeight="bold">{data.impactScore}</text>
          </g>)}

          {/* Issue indicator */}
          {data.hasIssue && (<g>
            <circle cx={-2} cy={-2} r={7} fill={COLORS.violation} opacity={0.9} />
            <text x={-2} y={1} textAnchor="middle" fill="#fff" fontSize={8} fontWeight="bold">!</text>
          </g>)}

          {/* Focus depth badge */}
          {data.focusDepthLevel !== undefined && data.focusDepthLevel > 0 && (<g>
            <circle cx={w + 2} cy={h - 4} r={7}
              fill={data.focusDepthLevel === 1 ? COLORS.impact1 : data.focusDepthLevel === 2 ? COLORS.impact2 : COLORS.impact3} />
            <text x={w + 2} y={h - 1} textAnchor="middle" fill="#fff" fontSize={8} fontFamily={FONT} fontWeight="bold">{data.focusDepthLevel}</text>
          </g>)}

          {/* Touched this session dot — CSS animation */}
          {touchedThisSession && (
            <circle cx={w - 3} cy={3} r={4} fill={COLORS.hot} opacity={0.9}
              className={heatLevel === 'hot' ? 'touched-pulse' : undefined} />
          )}
        </svg>

        {showLabel && (
          <div className="file-name" style={{
            color: '#f1f5f9', fontSize: 11, fontFamily: FONT, fontWeight: selected ? 700 : 500,
            textAlign: 'center', maxWidth: 78, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: 0.2,
          }} title={data.relativePath}>{fileName}</div>
        )}

        {showStats && (
          <div className="file-stats" style={{ color: COLORS.textDim, fontSize: 7, fontFamily: FONT, textAlign: 'center' }}>
            {data.importCount}↓ {data.exportCount}↑
          </div>
        )}

        {showStats && data.description && (
          <div className="file-description" title={data.description} style={{
            color: COLORS.textMuted, fontSize: 7, fontFamily: FONT, textAlign: 'center',
            maxWidth: 78, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{data.description}</div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    </>
  );
}

export const FileNode = memo(FileNodeComponent);
