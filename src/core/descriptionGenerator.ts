import type { FileCategory } from '../shared/protocol.js';

interface FileInfo {
  relativePath: string;
  category: FileCategory;
  exportCount: number;
  importCount: number;
  extension: string;
}

const CATEGORY_DESCRIPTIONS: Record<FileCategory, string> = {
  component: 'UI component',
  service: 'Service layer',
  util: 'Utility module',
  config: 'Configuration',
  test: 'Test file',
  unknown: 'Module',
};

/**
 * Generate a short 1-2 line description for a file based on its name, category, and stats.
 */
export function generateFileDescription(file: FileInfo): string {
  const name = file.relativePath.split('/').pop()?.replace(/\.\w+$/, '') ?? '';
  const base = CATEGORY_DESCRIPTIONS[file.category];

  // Pattern-based descriptions
  const nameLower = name.toLowerCase();

  if (nameLower.startsWith('use')) {
    const hookName = name.replace(/^use/, '');
    return `Hook - manages ${camelToWords(hookName)} state`;
  }

  if (nameLower.includes('store') || nameLower.includes('context')) {
    return `State store - ${file.exportCount} exports`;
  }

  if (nameLower.includes('api') || nameLower.includes('client') || nameLower.includes('fetch')) {
    return `API client - ${file.exportCount} endpoint${file.exportCount > 1 ? 's' : ''}`;
  }

  if (nameLower.includes('route') || nameLower.includes('router')) {
    return 'Route definitions';
  }

  if (nameLower.includes('config') || nameLower.includes('settings')) {
    return 'Project configuration';
  }

  if (nameLower.includes('util') || nameLower.includes('helper') || nameLower.includes('format')) {
    return `Helpers - ${file.exportCount} function${file.exportCount > 1 ? 's' : ''}`;
  }

  if (nameLower.includes('index')) {
    return `Barrel file - re-exports ${file.exportCount} module${file.exportCount > 1 ? 's' : ''}`;
  }

  if (nameLower.includes('type') || nameLower.includes('interface')) {
    return 'Type definitions';
  }

  if (nameLower.includes('constant') || nameLower.includes('enum')) {
    return 'Constants & enums';
  }

  if (file.category === 'test') {
    const subject = name.replace(/\.(test|spec)$/, '');
    return `Tests for ${subject}`;
  }

  if (file.category === 'component') {
    return `${base} - ${camelToWords(name)}`;
  }

  if (file.exportCount > 5) {
    return `${base} - ${file.exportCount} exports`;
  }

  return base;
}

/**
 * Generate a description for a folder based on the files it contains.
 */
export function generateFolderDescription(folder: string, files: FileInfo[]): string {
  const categories = new Map<FileCategory, number>();
  for (const f of files) {
    categories.set(f.category, (categories.get(f.category) ?? 0) + 1);
  }

  const dominant = [...categories.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!dominant) return `${files.length} files`;

  const folderName = folder.split('/').pop() ?? folder;
  const nameLower = folderName.toLowerCase();

  if (nameLower.includes('component') || nameLower.includes('page') || nameLower.includes('view')) {
    return `UI components - ${files.length} fichiers`;
  }
  if (nameLower.includes('hook')) {
    return `Custom hooks - ${files.length} fichiers`;
  }
  if (nameLower.includes('service') || nameLower.includes('api')) {
    return `Services & API - ${files.length} fichiers`;
  }
  if (nameLower.includes('util') || nameLower.includes('lib') || nameLower.includes('helper')) {
    return `Utilitaires - ${files.length} fichiers`;
  }
  if (nameLower.includes('store') || nameLower.includes('state')) {
    return `State management - ${files.length} fichiers`;
  }
  if (nameLower.includes('test') || nameLower.includes('__test')) {
    return `Tests - ${files.length} fichiers`;
  }
  if (nameLower.includes('config')) {
    return `Configuration - ${files.length} fichiers`;
  }

  const categoryLabel = CATEGORY_DESCRIPTIONS[dominant[0]];
  return `${categoryLabel} - ${files.length} fichiers`;
}

function camelToWords(str: string): string {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim()
    .toLowerCase();
}
