import type { FileCategory } from './protocol.js';

const TEST_PATTERNS = [
  /[\\/]tests?[\\/]/i,
  /[\\/]__tests__[\\/]/i,
  /[\\/]specs?[\\/]/i,
  /\.test\.\w+$/,
  /\.spec\.\w+$/,
];

const CONFIG_PATTERNS = [
  /[\\/]config[\\/]/i,
  /config\.\w+$/i,
  /\.env/i,
  /tsconfig/i,
  /vite\.config/i,
  /webpack\.config/i,
  /eslint/i,
  /prettier/i,
  /jest\.config/i,
  /vitest\.config/i,
];

const SERVICE_PATTERNS = [
  /[\\/]services?[\\/]/i,
  /[\\/]api[\\/]/i,
  /[\\/]middleware[\\/]/i,
  /[\\/]controllers?[\\/]/i,
  /[\\/]routes?[\\/]/i,
  /[\\/]handlers?[\\/]/i,
  /[\\/]models?[\\/]/i,
];

const UTIL_PATTERNS = [
  /[\\/]utils?[\\/]/i,
  /[\\/]helpers?[\\/]/i,
  /[\\/]lib[\\/]/i,
  /[\\/]shared[\\/]/i,
  /[\\/]common[\\/]/i,
];

const HOOK_PATTERNS = [
  /[\\/]hooks?[\\/]/i,
  /[\\/]use[A-Z][^/\\]*\.\w+$/,   // file named useXxx.ts
];

const STORE_PATTERNS = [
  /[\\/]stores?[\\/]/i,
  /[\\/]state[\\/]/i,
  /\.store\.\w+$/,
  /\.slice\.\w+$/,
  /[\\/]zustand[\\/]/i,
  /[\\/]redux[\\/]/i,
];

const TYPE_PATTERNS = [
  /[\\/]types?[\\/]/i,
  /\.types\.\w+$/,
  /\.d\.ts$/,
];

const PAGE_PATTERNS = [
  /[\\/]pages?[\\/]/i,
  /[\\/]app[\\/]/i,
  /[\\/]views?[\\/]/i,
  /[\\/]screens?[\\/]/i,
];

export function classifyFile(relativePath: string, extension: string): FileCategory {
  // Priority order: test > config > hook > store > type > page > service > util > component > util fallback

  for (const pattern of TEST_PATTERNS) {
    if (pattern.test(relativePath)) return 'test';
  }

  for (const pattern of CONFIG_PATTERNS) {
    if (pattern.test(relativePath)) return 'config';
  }

  for (const pattern of HOOK_PATTERNS) {
    if (pattern.test(relativePath)) return 'hook';
  }

  for (const pattern of STORE_PATTERNS) {
    if (pattern.test(relativePath)) return 'store';
  }

  for (const pattern of TYPE_PATTERNS) {
    if (pattern.test(relativePath)) return 'type';
  }

  for (const pattern of PAGE_PATTERNS) {
    if (pattern.test(relativePath)) return 'page';
  }

  for (const pattern of SERVICE_PATTERNS) {
    if (pattern.test(relativePath)) return 'service';
  }

  for (const pattern of UTIL_PATTERNS) {
    if (pattern.test(relativePath)) return 'util';
  }

  // Components: .tsx or .jsx files not matching any other category
  if (extension === '.tsx' || extension === '.jsx') {
    return 'component';
  }

  // TS/JS files that don't match any pattern are at minimum utilities
  if (extension === '.ts' || extension === '.js' || extension === '.mts' || extension === '.mjs') {
    return 'util';
  }

  return 'unknown';
}
