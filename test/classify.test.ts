import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/shared/classify';

describe('classifyFile', () => {
  // React-app fixture
  it('classifies .tsx files as component', () => {
    expect(classifyFile('src/App.tsx', '.tsx')).toBe('component');
    expect(classifyFile('src/components/Header.tsx', '.tsx')).toBe('component');
  });

  it('classifies hooks in hooks/ directory', () => {
    expect(classifyFile('src/hooks/useAuth.ts', '.ts')).toBe('hook');
  });

  it('classifies hooks by useXxx filename pattern', () => {
    expect(classifyFile('src/useDebounce.ts', '.ts')).toBe('hook');
  });

  it('classifies services', () => {
    expect(classifyFile('src/services/api.ts', '.ts')).toBe('service');
  });

  it('classifies utils', () => {
    expect(classifyFile('src/utils/format.ts', '.ts')).toBe('util');
    expect(classifyFile('src/utils/config.ts', '.ts')).toBe('config');
    expect(classifyFile('src/utils/index.ts', '.ts')).toBe('util');
  });

  // Express-api fixture
  it('classifies controllers as service', () => {
    expect(classifyFile('src/controllers/userController.ts', '.ts')).toBe('service');
  });

  it('classifies middleware as service', () => {
    expect(classifyFile('src/middleware/auth.ts', '.ts')).toBe('service');
  });

  it('classifies routes as service', () => {
    expect(classifyFile('src/routes/users.ts', '.ts')).toBe('service');
  });

  it('classifies models as service', () => {
    expect(classifyFile('src/models/User.ts', '.ts')).toBe('service');
  });

  // Config files
  it('classifies config files', () => {
    expect(classifyFile('src/middleware/config.js', '.js')).toBe('config');
    expect(classifyFile('tsconfig.json', '.json')).toBe('config');
    expect(classifyFile('vite.config.ts', '.ts')).toBe('config');
  });

  // Test files
  it('classifies test files', () => {
    expect(classifyFile('test/parser.test.ts', '.ts')).toBe('test');
    expect(classifyFile('src/__tests__/App.test.tsx', '.tsx')).toBe('test');
    expect(classifyFile('src/utils/format.spec.ts', '.ts')).toBe('test');
  });

  // Priority: test > config
  it('test wins over config in priority', () => {
    expect(classifyFile('test/config.test.ts', '.ts')).toBe('test');
  });

  // Fallback: .ts files default to 'util' instead of 'unknown'
  it('returns util for .ts files not matching any specific pattern', () => {
    expect(classifyFile('src/index.ts', '.ts')).toBe('util');
  });

  it('returns unknown for truly unclassifiable extensions', () => {
    expect(classifyFile('src/data.json', '.json')).toBe('unknown');
  });
});
