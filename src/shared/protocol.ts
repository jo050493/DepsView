import type { ImportKind } from '../parser/types.js';

export type FileCategory = 'component' | 'service' | 'hook' | 'store' | 'type' | 'page' | 'util' | 'config' | 'test' | 'unknown';
export type LayoutMode = 'hierarchical' | 'force-directed';

export type IssueSeverity = 'critical' | 'warning' | 'info';
export type IssueType = 'cycle' | 'phantom' | 'shadow' | 'orphan' | 'coupling';

export interface WebviewDetectionIssue {
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  filePaths: string[];
  line?: number;
  cycleGroup?: number;
}

export interface ImpactLevels {
  direct: number;
  indirect: number;
  far: number;
}

export interface WebviewNodeData {
  filePath: string;
  relativePath: string;
  exportCount: number;
  importCount: number;
  extension: string;
  category: FileCategory;
  lastModifiedMs: number;
  folder: string;
  impactScore: number;
  impactLevels?: ImpactLevels;
  description?: string;
  fileSize?: number;
  complexity?: { exportRatio: number };
}

export interface WebviewEdgeData {
  specifiers: string[];
  kind: ImportKind;
  line: number;
  specifierCount: number;
  sourceHeat?: number;
  targetHeat?: number;
}

// Extension → Webview
export interface GraphDataMessage {
  type: 'graphData';
  payload: {
    nodes: Array<{ id: string; data: WebviewNodeData }>;
    edges: Array<{ id: string; source: string; target: string; data: WebviewEdgeData }>;
    stats: { fileCount: number; edgeCount: number; orphanCount: number; hasCycles: boolean };
    folders: string[];
  };
}

export interface ActiveFileMessage {
  type: 'activeFileChanged';
  payload: { relativePath: string | null };
}

export interface SettingsMessage {
  type: 'settings';
  payload: { layoutMode: LayoutMode };
}

export interface DetectionsMessage {
  type: 'detections';
  payload: {
    issues: WebviewDetectionIssue[];
    cycleEdges: Array<{ source: string; target: string }>;
    healthScore: number;
  };
}

export interface FocusFileMessage {
  type: 'focusFile';
  payload: { relativePath: string };
}

export interface ClipboardContentMessage {
  type: 'clipboardContent';
  payload: { text: string; label: string };
}

export type ExtensionToWebviewMessage = GraphDataMessage | ActiveFileMessage | SettingsMessage | DetectionsMessage | FocusFileMessage | ClipboardContentMessage;

// Webview → Extension
export interface OpenFileRequest {
  type: 'openFile';
  payload: { filePath: string };
}

export interface ToggleLayoutRequest {
  type: 'toggleLayout';
  payload: { mode: LayoutMode };
}

export interface WebviewReadyMessage {
  type: 'webviewReady';
}

export interface CopyPromptRequest {
  type: 'copyPrompt';
  payload: { issueIndex: number };
}

export interface GenerateReportRequest {
  type: 'generateReport';
}

export type WebviewToExtensionMessage = OpenFileRequest | ToggleLayoutRequest | WebviewReadyMessage | CopyPromptRequest | GenerateReportRequest;
