import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { initParser, getLanguage, parseSource, setGrammarDir } from '../src/parser/treeSitter';
import { extractJavaScript } from '../src/parser/extractors/javascript';
import { extractTypeScript } from '../src/parser/extractors/typescript';

const grammarsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'grammars');

beforeAll(async () => {
  setGrammarDir(grammarsDir);
  await initParser();
});

async function parseJS(code: string) {
  const lang = await getLanguage('.js');
  const tree = parseSource(code, lang);
  const result = extractJavaScript(tree);
  tree.delete();
  return result;
}

async function parseTS(code: string) {
  const lang = await getLanguage('.ts');
  const tree = parseSource(code, lang);
  const result = extractTypeScript(tree);
  tree.delete();
  return result;
}

async function parseTSX(code: string) {
  const lang = await getLanguage('.tsx');
  const tree = parseSource(code, lang);
  const result = extractTypeScript(tree);
  tree.delete();
  return result;
}

describe('Import extraction', () => {
  it('extracts static named imports', async () => {
    const { imports } = await parseJS(`import { foo, bar } from './utils';`);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('./utils');
    expect(imports[0].kind).toBe('static');
    expect(imports[0].specifiers).toHaveLength(2);
    expect(imports[0].specifiers[0].name).toBe('foo');
    expect(imports[0].specifiers[1].name).toBe('bar');
  });

  it('extracts default import', async () => {
    const { imports } = await parseJS(`import App from './App';`);
    expect(imports).toHaveLength(1);
    expect(imports[0].specifiers).toHaveLength(1);
    expect(imports[0].specifiers[0].isDefault).toBe(true);
    expect(imports[0].specifiers[0].name).toBe('App');
  });

  it('extracts namespace import', async () => {
    const { imports } = await parseJS(`import * as utils from './utils';`);
    expect(imports).toHaveLength(1);
    expect(imports[0].specifiers).toHaveLength(1);
    expect(imports[0].specifiers[0].isNamespace).toBe(true);
    expect(imports[0].specifiers[0].name).toBe('utils');
  });

  it('extracts dynamic import', async () => {
    const { imports } = await parseJS(`const mod = import('./lazy');`);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('./lazy');
    expect(imports[0].kind).toBe('dynamic');
  });

  it('extracts require()', async () => {
    const { imports } = await parseJS(`const fs = require('./config');`);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('./config');
    expect(imports[0].kind).toBe('require');
  });

  it('extracts side-effect import', async () => {
    const { imports } = await parseJS(`import './styles.css';`);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('./styles.css');
    expect(imports[0].specifiers).toHaveLength(0);
  });

  it('extracts mixed imports (default + named)', async () => {
    const { imports } = await parseJS(`import React, { useState, useEffect as ue } from 'react';`);
    expect(imports).toHaveLength(1);
    expect(imports[0].specifiers.length).toBeGreaterThanOrEqual(3);
    const defaultSpec = imports[0].specifiers.find(s => s.isDefault);
    expect(defaultSpec?.name).toBe('React');
    const aliasSpec = imports[0].specifiers.find(s => s.alias === 'ue');
    expect(aliasSpec?.name).toBe('useEffect');
  });

  it('extracts type-only import in TypeScript', async () => {
    const { imports } = await parseTS(`import type { Foo } from './types';`);
    expect(imports).toHaveLength(1);
    expect(imports[0].isTypeOnly).toBe(true);
    expect(imports[0].source).toBe('./types');
  });

  it('marks regular TS import as not type-only', async () => {
    const { imports } = await parseTS(`import { Foo } from './types';`);
    expect(imports).toHaveLength(1);
    expect(imports[0].isTypeOnly).toBe(false);
  });
});

describe('Export extraction', () => {
  it('extracts named exports', async () => {
    const { exports } = await parseJS(`export { foo, bar };`);
    expect(exports).toHaveLength(1);
    expect(exports[0].kind).toBe('named');
    expect(exports[0].specifiers).toHaveLength(2);
  });

  it('extracts re-export', async () => {
    const { exports } = await parseJS(`export { foo } from './utils';`);
    expect(exports).toHaveLength(1);
    expect(exports[0].source).toBe('./utils');
    expect(exports[0].kind).toBe('named');
  });

  it('extracts barrel export (export *)', async () => {
    const { exports } = await parseJS(`export * from './components';`);
    expect(exports).toHaveLength(1);
    expect(exports[0].kind).toBe('all');
    expect(exports[0].source).toBe('./components');
  });

  it('extracts default export', async () => {
    const { exports } = await parseJS(`export default function App() {}`);
    expect(exports).toHaveLength(1);
    expect(exports[0].kind).toBe('default');
  });

  it('extracts export declaration', async () => {
    const { exports } = await parseJS(`export function calculate() {}`);
    expect(exports).toHaveLength(1);
    expect(exports[0].kind).toBe('declaration');
    expect(exports[0].specifiers[0].name).toBe('calculate');
  });

  it('extracts export const', async () => {
    const { exports } = await parseJS(`export const PI = 3.14;`);
    expect(exports).toHaveLength(1);
    expect(exports[0].kind).toBe('declaration');
  });
});

describe('TSX support', () => {
  it('parses TSX with JSX and imports', async () => {
    const code = `
import React from 'react';
import { Button } from './Button';

export default function App() {
  return <Button>Hello</Button>;
}
`;
    const { imports, exports } = await parseTSX(code);
    expect(imports).toHaveLength(2);
    expect(imports[0].source).toBe('react');
    expect(imports[1].source).toBe('./Button');
    expect(exports).toHaveLength(1);
    expect(exports[0].kind).toBe('default');
  });
});
