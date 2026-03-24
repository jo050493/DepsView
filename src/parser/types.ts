export type ImportKind = 'static' | 'dynamic' | 'require';

export interface ImportSpecifier {
  name: string;
  alias?: string;
  isDefault: boolean;
  isNamespace: boolean;
}

export interface ImportInfo {
  /** Raw module specifier, e.g. './utils/helper' */
  source: string;
  /** Resolved absolute file path (null if unresolved) */
  resolvedPath?: string;
  specifiers: ImportSpecifier[];
  kind: ImportKind;
  /** 1-based line number */
  line: number;
  isTypeOnly: boolean;
}

export type ExportKind = 'named' | 'default' | 'all' | 'declaration';

export interface ExportSpecifier {
  name: string;
  alias?: string;
}

export interface ExportInfo {
  specifiers: ExportSpecifier[];
  /** If re-export, the source module */
  source?: string;
  kind: ExportKind;
  line: number;
  isTypeOnly: boolean;
}

export interface FileParseResult {
  filePath: string;
  imports: ImportInfo[];
  exports: ExportInfo[];
}
