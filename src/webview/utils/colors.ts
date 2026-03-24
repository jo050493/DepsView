import type { FileCategory } from '../../shared/protocol.js';
import type { ImportKind } from '../../parser/types.js';

export const FONT = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace";

export const COLORS = {
  bg: '#0a0e17',
  bgPanel: '#0d1220',
  bgCard: '#111827',
  border: '#1e293b',
  borderActive: '#3b82f6',
  text: '#e2e8f0',
  textDim: '#64748b',
  textMuted: '#475569',
  hot: '#ef4444',
  warm: '#f97316',
  cold: '#64748b40',
  violation: '#ef4444',
  impact1: '#ef4444',
  impact2: '#f97316',
  impact3: '#eab308',
  dotGrid: '#47556920',
} as const;

export const CATEGORY_COLORS: Record<FileCategory, string> = {
  component: '#3b82f6',
  service: '#10b981',
  hook: '#f472b6',
  store: '#fb923c',
  type: '#94a3b8',
  page: '#22d3ee',
  util: '#8b5cf6',
  config: '#f59e0b',
  test: '#a855f7',
  unknown: '#6b7280',
};

export const EDGE_KIND_COLORS: Record<ImportKind, string> = {
  static: '#3b82f680',
  dynamic: '#10b98180',
  require: '#9ca3af80',
};

export const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};
