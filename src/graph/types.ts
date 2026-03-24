import type { ImportKind } from '../parser/types.js';

export interface GraphNodeData {
  filePath: string;
  relativePath: string;
  exportCount: number;
  importCount: number;
  extension: string;
  lastModifiedMs: number;
  fileSize?: number;
}

export interface GraphEdgeData {
  specifiers: string[];
  kind: ImportKind;
  line: number;
}

// Detection types
export type IssueSeverity = 'critical' | 'warning' | 'info';
export type IssueType = 'cycle' | 'phantom' | 'shadow' | 'orphan' | 'coupling';

export interface DetectionIssue {
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  filePaths: string[];
  line?: number;
  cycleGroup?: number;
}

export interface DetectionResult {
  issues: DetectionIssue[];
  cycleEdges: Array<{ source: string; target: string }>;
  healthScore: number;
}

// Impact types
export interface ImpactLevel {
  level: number;
  nodeIds: string[];
}

export interface ImpactData {
  sourceNode: string;
  levels: ImpactLevel[];
  totalAffected: number;
}

export interface ScanResult {
  root: string;
  nodes: Array<{ id: string; data: GraphNodeData }>;
  edges: Array<{ source: string; target: string; data: GraphEdgeData }>;
  stats: {
    fileCount: number;
    edgeCount: number;
    orphanCount: number;
    hasCycles: boolean;
  };
}
