import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { setGrammarDir } from '../src/parser/treeSitter';
import { scanProject } from '../src/parser/scanner';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const grammarsDir = path.join(testDir, '..', 'grammars');

beforeAll(() => {
  setGrammarDir(grammarsDir);
});

describe('scanProject - react-app', () => {
  it('discovers all fixture files', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);

    // 8 files: App.tsx, Header.tsx, components/index.ts, useAuth.ts,
    //          api.ts, format.ts, config.ts, utils/index.ts
    expect(results.length).toBe(8);
  });

  it('resolves relative imports correctly', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);

    const app = results.find(r => r.filePath.endsWith('App.tsx'));
    expect(app).toBeDefined();

    // App imports: react (bare, unresolved), ./components (barrel), ./hooks/useAuth
    const resolvedImports = app!.imports.filter(i => i.resolvedPath);
    expect(resolvedImports.length).toBeGreaterThanOrEqual(2);
  });

  it('detects barrel exports', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'react-app');
    const results = await scanProject(fixtureDir);

    const barrel = results.find(r => r.filePath.endsWith('components/index.ts'));
    expect(barrel).toBeDefined();
    expect(barrel!.exports.some(e => e.kind === 'all')).toBe(true);
  });
});

describe('scanProject - express-api', () => {
  it('discovers all fixture files', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'express-api');
    const results = await scanProject(fixtureDir);

    // 8 files: index.ts, routes/users.ts, controllers/userController.ts,
    //          services/userService.ts, models/User.ts, middleware/auth.ts,
    //          middleware/config.js, utils/logger.ts
    expect(results.length).toBe(8);
  });

  it('detects dynamic imports', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'express-api');
    const results = await scanProject(fixtureDir);

    const controller = results.find(r => r.filePath.endsWith('userController.ts'));
    expect(controller).toBeDefined();
    const dynamicImport = controller!.imports.find(i => i.kind === 'dynamic');
    expect(dynamicImport).toBeDefined();
    expect(dynamicImport!.source).toBe('../utils/logger');
  });

  it('detects require() calls', async () => {
    const fixtureDir = path.join(testDir, 'fixtures', 'express-api');
    const results = await scanProject(fixtureDir);

    const auth = results.find(r => r.filePath.endsWith('auth.ts'));
    expect(auth).toBeDefined();
    const requireImport = auth!.imports.find(i => i.kind === 'require');
    expect(requireImport).toBeDefined();
    expect(requireImport!.source).toBe('./config');
  });
});
