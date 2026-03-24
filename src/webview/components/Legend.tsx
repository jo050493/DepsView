import React, { memo } from 'react';
import { COLORS, FONT, CATEGORY_COLORS } from '../utils/colors.js';
import type { FileCategory } from '../../shared/protocol.js';

const FILE_TYPES: Array<{ label: string; color: string; category: FileCategory }> = [
  { label: 'Component', color: CATEGORY_COLORS.component, category: 'component' },
  { label: 'Service', color: CATEGORY_COLORS.service, category: 'service' },
  { label: 'Hook', color: CATEGORY_COLORS.hook, category: 'hook' },
  { label: 'Store', color: CATEGORY_COLORS.store, category: 'store' },
  { label: 'Page', color: CATEGORY_COLORS.page, category: 'page' },
  { label: 'Utility', color: CATEGORY_COLORS.util, category: 'util' },
  { label: 'Type', color: CATEGORY_COLORS.type, category: 'type' },
  { label: 'Config', color: CATEGORY_COLORS.config, category: 'config' },
  { label: 'Test', color: CATEGORY_COLORS.test, category: 'test' },
];

const CLUSTER_HEALTH = [
  { label: 'Clean', color: '#10b981' },
  { label: 'Warn', color: '#f59e0b' },
  { label: 'Crit', color: '#ef4444' },
];

interface LegendProps {
  hiddenCategories?: Set<string>;
  onToggleCategory?: (category: FileCategory) => void;
}

function LegendComponent({ hiddenCategories, onToggleCategory }: LegendProps) {
  return (
    <div style={{
      background: COLORS.bgPanel,
      borderTop: `1px solid ${COLORS.border}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      justifyContent: 'space-between',
      height: 30,
      fontFamily: FONT,
    }}>
      {/* File types — compact dots */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {FILE_TYPES.map((item, i) => {
          const isHidden = hiddenCategories?.has(item.category) ?? false;
          return (
            <div key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                opacity: isHidden ? 0.2 : 0.75,
                cursor: onToggleCategory ? 'pointer' : 'default',
              }}
              onClick={() => onToggleCategory?.(item.category)}
              onMouseEnter={e => { if (!isHidden) e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = isHidden ? '0.2' : '0.75'; }}
              title={`${item.label} — click to ${isHidden ? 'show' : 'hide'}`}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
                background: item.color, opacity: isHidden ? 0.3 : 1,
              }} />
              <span style={{ fontSize: 7.5, color: isHidden ? COLORS.textMuted : COLORS.textDim }}>{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* Cluster health — compact */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {CLUSTER_HEALTH.map((h, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, opacity: 0.65 }}>
            <span style={{ width: 8, height: 5, borderRadius: 1, background: h.color, display: 'inline-block' }} />
            <span style={{ fontSize: 7, color: COLORS.textDim }}>{h.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export const Legend = memo(LegendComponent);
