import React, { memo } from 'react';
import type { GraphDataMessage, DetectionsMessage } from '../../shared/protocol.js';
import { COLORS, FONT } from '../utils/colors.js';

export interface SemanticFilters {
  showTests: boolean;
  showConfigs: boolean;
  showAssets: boolean;
}

interface TopBarProps {
  stats: GraphDataMessage['payload']['stats'] | null;
  detections: DetectionsMessage['payload'] | null;
  semanticFilters: SemanticFilters;
  onToggleSemanticFilter: (key: 'showTests' | 'showConfigs' | 'showAssets') => void;
  totalFileCount: number;
  visibleFileCount: number;
  focusActive: boolean;
  focusDepth: number;
  onFocusDepthChange: (depth: number) => void;
  layoutMode: 'hierarchical' | 'force-directed';
  onToggleLayoutMode: () => void;
}

const pillStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 9px',
  borderRadius: 10,
  fontSize: 9,
  fontFamily: FONT,
  fontWeight: 500,
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'all 0.2s ease',
  background: active ? COLORS.bgCard : 'transparent',
  border: `1px solid ${active ? COLORS.border : 'transparent'}`,
  color: active ? COLORS.text : COLORS.textMuted,
  opacity: active ? 1 : 0.5,
  textDecoration: active ? 'none' : 'line-through',
});

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width={10} height={10} viewBox="0 0 16 16" fill="none">
        <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={8} cy={8} r={2} stroke="currentColor" strokeWidth={1.5} />
      </svg>
    );
  }
  return (
    <svg width={10} height={10} viewBox="0 0 16 16" fill="none">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={2} y1={14} x2={14} y2={2} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

function TopBarComponent({ stats, detections, semanticFilters, onToggleSemanticFilter, totalFileCount, visibleFileCount, focusActive, focusDepth, onFocusDepthChange, layoutMode, onToggleLayoutMode }: TopBarProps) {
  const violationCount = detections?.issues.filter(i => i.type === 'cycle').length ?? 0;
  const orphanCount = stats?.orphanCount ?? 0;
  const logoUrl = (window as any).__DEPSVIEW_ICON__ || '';

  return (
    <div style={{
      background: COLORS.bgPanel,
      borderBottom: `1px solid ${COLORS.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 14px',
      height: 44,
      fontFamily: FONT,
    }}>
      {/* Logo + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src={logoUrl} width={22} height={22} style={{ borderRadius: 4 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, letterSpacing: 1.2, transition: 'text-shadow 0.2s ease' }}
          onMouseEnter={e => { e.currentTarget.style.textShadow = '0 0 8px #3b82f650'; }}
          onMouseLeave={e => { e.currentTarget.style.textShadow = 'none'; }}
        >DepsView</span>
        <span style={{ fontSize: 9, color: COLORS.textDim, background: COLORS.bgCard, padding: '2px 7px', borderRadius: 3 }}>v0.2.0</span>
      </div>

      {/* Semantic filter toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 8, color: COLORS.textMuted, marginRight: 2, textTransform: 'uppercase', letterSpacing: 0.8 }}>Filters</span>
        <div
          style={pillStyle(semanticFilters.showTests)}
          onClick={() => onToggleSemanticFilter('showTests')}
        >
          <EyeIcon open={semanticFilters.showTests} />
          <span>Tests</span>
        </div>
        <div
          style={pillStyle(semanticFilters.showConfigs)}
          onClick={() => onToggleSemanticFilter('showConfigs')}
        >
          <EyeIcon open={semanticFilters.showConfigs} />
          <span>Configs</span>
        </div>
        <div
          style={pillStyle(semanticFilters.showAssets)}
          onClick={() => onToggleSemanticFilter('showAssets')}
        >
          <EyeIcon open={semanticFilters.showAssets} />
          <span>Assets</span>
        </div>
      </div>

      {/* Spacer — Couplage toggle removed */}
      <div />

      {/* Focus depth slider — only visible in focus mode */}
      {focusActive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px' }}>
          <span style={{ fontSize: 8, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Depth</span>
          {[1, 2].map(d => (
            <div
              key={d}
              onClick={() => onFocusDepthChange(d === focusDepth && d > 1 ? d - 1 : d)}
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontFamily: FONT,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: d <= focusDepth ? (d === 1 ? '#ef4444' : d === 2 ? '#f97316' : '#eab308') : 'transparent',
                border: `1px solid ${d <= focusDepth ? 'transparent' : COLORS.border}`,
                color: d <= focusDepth ? '#fff' : COLORS.textMuted,
                opacity: d <= focusDepth ? 1 : 0.5,
              }}
            >
              {d}
            </div>
          ))}
        </div>
      )}

      {/* Stats + counter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 9.5, color: COLORS.textDim }}>
        {totalFileCount > 0 && (
          <>
            <span style={{ color: visibleFileCount < totalFileCount ? '#3b82f6' : COLORS.textDim, fontWeight: visibleFileCount < totalFileCount ? 600 : 400 }}>
              {visibleFileCount} / {totalFileCount} files
            </span>
            <span style={{ opacity: 0.4 }}>&middot;</span>
          </>
        )}
        {stats && (
          <>
            <span>{stats.edgeCount} deps</span>
            {violationCount > 0 && (
              <>
                <span style={{ opacity: 0.4 }}>&middot;</span>
                <span style={{ color: COLORS.violation }}>{violationCount} violation{violationCount > 1 ? 's' : ''}</span>
              </>
            )}
            {orphanCount > 0 && (
              <>
                <span style={{ opacity: 0.4 }}>&middot;</span>
                <span style={{ color: COLORS.textDim }}>{orphanCount} orphan{orphanCount > 1 ? 's' : ''}</span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export const TopBar = memo(TopBarComponent);
