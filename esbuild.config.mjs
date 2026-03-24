import * as esbuild from 'esbuild';
import { copy } from 'esbuild-plugin-copy';

const isWatch = process.argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  sourcemap: true,
  minify: false,
};

// Extension host bundle
const extensionBuild = esbuild.context({
  ...sharedOptions,
  entryPoints: ['src/extension/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['vscode', 'web-tree-sitter', 'express', 'ws'],
  plugins: [
    copy({
      resolveFrom: 'cwd',
      assets: [
        { from: 'grammars/*.wasm', to: 'dist/grammars' },
      ],
    }),
  ],
});

// Scan worker bundle (runs in worker_threads)
const workerBuild = esbuild.context({
  ...sharedOptions,
  entryPoints: ['src/extension/scanWorker.ts'],
  outfile: 'dist/scanWorker.js',
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['web-tree-sitter'],
});

// CLI bundle
const cliBuild = esbuild.context({
  ...sharedOptions,
  entryPoints: ['src/cli/index.ts'],
  outfile: 'dist/cli.js',
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['web-tree-sitter'],
  banner: { js: '#!/usr/bin/env node' },
});

// Server standalone bundle
const serverBuild = esbuild.context({
  ...sharedOptions,
  entryPoints: ['src/server/index.ts'],
  outfile: 'dist/server/index.js',
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['vscode', 'web-tree-sitter', 'express', 'ws'],
});

// MCP server bundle
const mcpBuild = esbuild.context({
  ...sharedOptions,
  entryPoints: ['src/mcp/index.ts'],
  outfile: 'dist/mcp.js',
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['web-tree-sitter'],
  banner: { js: '#!/usr/bin/env node' },
});

// Webview (React Flow) bundle
const webviewBuild = esbuild.context({
  ...sharedOptions,
  entryPoints: ['src/webview/index.tsx'],
  outfile: 'dist/webview/webview.js',
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

async function main() {
  const [ext, wrk, cli, srv, mcp, wv] = await Promise.all([extensionBuild, workerBuild, cliBuild, serverBuild, mcpBuild, webviewBuild]);

  if (isWatch) {
    await Promise.all([ext.watch(), wrk.watch(), cli.watch(), srv.watch(), mcp.watch(), wv.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([ext.rebuild(), wrk.rebuild(), cli.rebuild(), srv.rebuild(), mcp.rebuild(), wv.rebuild()]);
    await Promise.all([ext.dispose(), wrk.dispose(), cli.dispose(), srv.dispose(), mcp.dispose(), wv.dispose()]);
    console.log('Build complete.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
