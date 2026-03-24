// Standalone test server — serves webview with mock data for UI testing
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 7890;

const app = express();
const webviewDir = path.join(__dirname, 'dist', 'webview');
app.use('/webview', express.static(webviewDir));

app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DepsView — UI Test</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100vh; overflow: hidden; background: #0a0e17; }
  </style>
  <link rel="stylesheet" href="/webview/webview.css">
</head>
<body>
  <div id="root"></div>
  <script>
    window.__DEPSVIEW_WS_PORT__ = ${PORT};
  </script>
  <script src="/webview/webview.js"></script>
</body>
</html>`);
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Mock data simulating a real React project
function getMockGraphData() {
  const now = Date.now();
  const nodes = [
    // Components
    { id: 'src/components/App.tsx', data: { filePath: '/project/src/components/App.tsx', relativePath: 'src/components/App.tsx', exportCount: 1, importCount: 8, extension: '.tsx', category: 'component', lastModifiedMs: now - 120000, folder: 'src/components', impactScore: 5, fileSize: 4200, complexity: { exportRatio: 0.12 } } },
    { id: 'src/components/Header.tsx', data: { filePath: '/project/src/components/Header.tsx', relativePath: 'src/components/Header.tsx', exportCount: 1, importCount: 3, extension: '.tsx', category: 'component', lastModifiedMs: now - 3600000, folder: 'src/components', impactScore: 2, fileSize: 1800 } },
    { id: 'src/components/Sidebar.tsx', data: { filePath: '/project/src/components/Sidebar.tsx', relativePath: 'src/components/Sidebar.tsx', exportCount: 1, importCount: 4, extension: '.tsx', category: 'component', lastModifiedMs: now - 7200000, folder: 'src/components', impactScore: 1, fileSize: 2400 } },
    { id: 'src/components/Footer.tsx', data: { filePath: '/project/src/components/Footer.tsx', relativePath: 'src/components/Footer.tsx', exportCount: 1, importCount: 1, extension: '.tsx', category: 'component', lastModifiedMs: now - 86400000, folder: 'src/components', impactScore: 0, fileSize: 800 } },
    { id: 'src/components/Modal.tsx', data: { filePath: '/project/src/components/Modal.tsx', relativePath: 'src/components/Modal.tsx', exportCount: 1, importCount: 2, extension: '.tsx', category: 'component', lastModifiedMs: now - 60000, folder: 'src/components', impactScore: 3, fileSize: 3100 } },
    { id: 'src/components/Button.tsx', data: { filePath: '/project/src/components/Button.tsx', relativePath: 'src/components/Button.tsx', exportCount: 3, importCount: 1, extension: '.tsx', category: 'component', lastModifiedMs: now - 172800000, folder: 'src/components', impactScore: 4, fileSize: 1200 } },
    { id: 'src/components/Card.tsx', data: { filePath: '/project/src/components/Card.tsx', relativePath: 'src/components/Card.tsx', exportCount: 1, importCount: 1, extension: '.tsx', category: 'component', lastModifiedMs: now - 259200000, folder: 'src/components', impactScore: 2, fileSize: 950 } },
    { id: 'src/components/Table.tsx', data: { filePath: '/project/src/components/Table.tsx', relativePath: 'src/components/Table.tsx', exportCount: 2, importCount: 3, extension: '.tsx', category: 'component', lastModifiedMs: now - 43200000, folder: 'src/components', impactScore: 1, fileSize: 2800 } },

    // Pages
    { id: 'src/pages/Home.tsx', data: { filePath: '/project/src/pages/Home.tsx', relativePath: 'src/pages/Home.tsx', exportCount: 1, importCount: 6, extension: '.tsx', category: 'page', lastModifiedMs: now - 300000, folder: 'src/pages', impactScore: 0, fileSize: 3500 } },
    { id: 'src/pages/Dashboard.tsx', data: { filePath: '/project/src/pages/Dashboard.tsx', relativePath: 'src/pages/Dashboard.tsx', exportCount: 1, importCount: 7, extension: '.tsx', category: 'page', lastModifiedMs: now - 180000, folder: 'src/pages', impactScore: 0, fileSize: 5200 } },
    { id: 'src/pages/Settings.tsx', data: { filePath: '/project/src/pages/Settings.tsx', relativePath: 'src/pages/Settings.tsx', exportCount: 1, importCount: 4, extension: '.tsx', category: 'page', lastModifiedMs: now - 604800000, folder: 'src/pages', impactScore: 0, fileSize: 2900 } },
    { id: 'src/pages/Profile.tsx', data: { filePath: '/project/src/pages/Profile.tsx', relativePath: 'src/pages/Profile.tsx', exportCount: 1, importCount: 5, extension: '.tsx', category: 'page', lastModifiedMs: now - 1000, folder: 'src/pages', impactScore: 0, fileSize: 2100 } },

    // Hooks
    { id: 'src/hooks/useAuth.ts', data: { filePath: '/project/src/hooks/useAuth.ts', relativePath: 'src/hooks/useAuth.ts', exportCount: 1, importCount: 2, extension: '.ts', category: 'hook', lastModifiedMs: now - 86400000, folder: 'src/hooks', impactScore: 3, fileSize: 1500 } },
    { id: 'src/hooks/useTheme.ts', data: { filePath: '/project/src/hooks/useTheme.ts', relativePath: 'src/hooks/useTheme.ts', exportCount: 1, importCount: 1, extension: '.ts', category: 'hook', lastModifiedMs: now - 172800000, folder: 'src/hooks', impactScore: 2, fileSize: 800 } },
    { id: 'src/hooks/useFetch.ts', data: { filePath: '/project/src/hooks/useFetch.ts', relativePath: 'src/hooks/useFetch.ts', exportCount: 1, importCount: 1, extension: '.ts', category: 'hook', lastModifiedMs: now - 259200000, folder: 'src/hooks', impactScore: 2, fileSize: 1100 } },

    // Services
    { id: 'src/services/api.ts', data: { filePath: '/project/src/services/api.ts', relativePath: 'src/services/api.ts', exportCount: 8, importCount: 2, extension: '.ts', category: 'service', lastModifiedMs: now - 43200000, folder: 'src/services', impactScore: 6, fileSize: 4800 } },
    { id: 'src/services/auth.ts', data: { filePath: '/project/src/services/auth.ts', relativePath: 'src/services/auth.ts', exportCount: 4, importCount: 1, extension: '.ts', category: 'service', lastModifiedMs: now - 86400000, folder: 'src/services', impactScore: 4, fileSize: 2200 } },
    { id: 'src/services/storage.ts', data: { filePath: '/project/src/services/storage.ts', relativePath: 'src/services/storage.ts', exportCount: 3, importCount: 0, extension: '.ts', category: 'service', lastModifiedMs: now - 604800000, folder: 'src/services', impactScore: 1, fileSize: 900 } },

    // Store
    { id: 'src/store/index.ts', data: { filePath: '/project/src/store/index.ts', relativePath: 'src/store/index.ts', exportCount: 5, importCount: 3, extension: '.ts', category: 'store', lastModifiedMs: now - 3600000, folder: 'src/store', impactScore: 5, fileSize: 3200 } },
    { id: 'src/store/userSlice.ts', data: { filePath: '/project/src/store/userSlice.ts', relativePath: 'src/store/userSlice.ts', exportCount: 3, importCount: 2, extension: '.ts', category: 'store', lastModifiedMs: now - 7200000, folder: 'src/store', impactScore: 2, fileSize: 1800 } },

    // Types
    { id: 'src/types/index.ts', data: { filePath: '/project/src/types/index.ts', relativePath: 'src/types/index.ts', exportCount: 12, importCount: 0, extension: '.ts', category: 'type', lastModifiedMs: now - 259200000, folder: 'src/types', impactScore: 6, fileSize: 2100 } },
    { id: 'src/types/api.ts', data: { filePath: '/project/src/types/api.ts', relativePath: 'src/types/api.ts', exportCount: 8, importCount: 0, extension: '.ts', category: 'type', lastModifiedMs: now - 604800000, folder: 'src/types', impactScore: 3, fileSize: 1400 } },

    // Utils
    { id: 'src/utils/format.ts', data: { filePath: '/project/src/utils/format.ts', relativePath: 'src/utils/format.ts', exportCount: 5, importCount: 0, extension: '.ts', category: 'util', lastModifiedMs: now - 1209600000, folder: 'src/utils', impactScore: 2, fileSize: 1600 } },
    { id: 'src/utils/validation.ts', data: { filePath: '/project/src/utils/validation.ts', relativePath: 'src/utils/validation.ts', exportCount: 4, importCount: 1, extension: '.ts', category: 'util', lastModifiedMs: now - 604800000, folder: 'src/utils', impactScore: 1, fileSize: 1100 } },
    { id: 'src/utils/helpers.ts', data: { filePath: '/project/src/utils/helpers.ts', relativePath: 'src/utils/helpers.ts', exportCount: 6, importCount: 0, extension: '.ts', category: 'util', lastModifiedMs: now - 2592000000, folder: 'src/utils', impactScore: 3, fileSize: 2000 } },

    // Config
    { id: 'src/config/routes.ts', data: { filePath: '/project/src/config/routes.ts', relativePath: 'src/config/routes.ts', exportCount: 1, importCount: 4, extension: '.ts', category: 'config', lastModifiedMs: now - 172800000, folder: 'src/config', impactScore: 1, fileSize: 700 } },

    // Tests
    { id: 'src/__tests__/App.test.tsx', data: { filePath: '/project/src/__tests__/App.test.tsx', relativePath: 'src/__tests__/App.test.tsx', exportCount: 0, importCount: 3, extension: '.tsx', category: 'test', lastModifiedMs: now - 86400000, folder: 'src/__tests__', impactScore: 0, fileSize: 1500 } },

    // Orphan
    { id: 'src/utils/deprecated.ts', data: { filePath: '/project/src/utils/deprecated.ts', relativePath: 'src/utils/deprecated.ts', exportCount: 0, importCount: 0, extension: '.ts', category: 'util', lastModifiedMs: now - 5184000000, folder: 'src/utils', impactScore: 0, fileSize: 400 } },
  ];

  const mkEdge = (src, tgt, specs = ['default'], kind = 'static') => ({
    id: `${src}→${tgt}`,
    source: src,
    target: tgt,
    data: { specifiers: specs, kind, line: 1, specifierCount: specs.length },
  });

  const edges = [
    // App imports
    mkEdge('src/components/App.tsx', 'src/components/Header.tsx', ['Header']),
    mkEdge('src/components/App.tsx', 'src/components/Sidebar.tsx', ['Sidebar']),
    mkEdge('src/components/App.tsx', 'src/components/Footer.tsx', ['Footer']),
    mkEdge('src/components/App.tsx', 'src/hooks/useAuth.ts', ['useAuth']),
    mkEdge('src/components/App.tsx', 'src/hooks/useTheme.ts', ['useTheme']),
    mkEdge('src/components/App.tsx', 'src/store/index.ts', ['store']),
    mkEdge('src/components/App.tsx', 'src/config/routes.ts', ['routes']),
    mkEdge('src/components/App.tsx', 'src/types/index.ts', ['AppProps']),

    // Header
    mkEdge('src/components/Header.tsx', 'src/hooks/useAuth.ts', ['useAuth']),
    mkEdge('src/components/Header.tsx', 'src/components/Button.tsx', ['Button']),
    mkEdge('src/components/Header.tsx', 'src/types/index.ts', ['User']),

    // Sidebar
    mkEdge('src/components/Sidebar.tsx', 'src/hooks/useAuth.ts', ['useAuth']),
    mkEdge('src/components/Sidebar.tsx', 'src/components/Button.tsx', ['Button']),
    mkEdge('src/components/Sidebar.tsx', 'src/config/routes.ts', ['routes']),
    mkEdge('src/components/Sidebar.tsx', 'src/types/index.ts', ['NavItem']),

    // Modal
    mkEdge('src/components/Modal.tsx', 'src/components/Button.tsx', ['Button']),
    mkEdge('src/components/Modal.tsx', 'src/hooks/useTheme.ts', ['useTheme']),

    // Table
    mkEdge('src/components/Table.tsx', 'src/types/index.ts', ['Column', 'Row']),
    mkEdge('src/components/Table.tsx', 'src/utils/format.ts', ['formatDate', 'formatNumber']),
    mkEdge('src/components/Table.tsx', 'src/components/Button.tsx', ['Button']),

    // Pages
    mkEdge('src/pages/Home.tsx', 'src/components/App.tsx', ['App']),
    mkEdge('src/pages/Home.tsx', 'src/components/Card.tsx', ['Card']),
    mkEdge('src/pages/Home.tsx', 'src/services/api.ts', ['fetchDashboard']),
    mkEdge('src/pages/Home.tsx', 'src/hooks/useFetch.ts', ['useFetch']),
    mkEdge('src/pages/Home.tsx', 'src/types/api.ts', ['DashboardData']),
    mkEdge('src/pages/Home.tsx', 'src/utils/format.ts', ['formatDate']),

    mkEdge('src/pages/Dashboard.tsx', 'src/components/Table.tsx', ['Table']),
    mkEdge('src/pages/Dashboard.tsx', 'src/components/Card.tsx', ['Card']),
    mkEdge('src/pages/Dashboard.tsx', 'src/components/Modal.tsx', ['Modal']),
    mkEdge('src/pages/Dashboard.tsx', 'src/services/api.ts', ['fetchStats', 'fetchUsers']),
    mkEdge('src/pages/Dashboard.tsx', 'src/hooks/useFetch.ts', ['useFetch']),
    mkEdge('src/pages/Dashboard.tsx', 'src/store/index.ts', ['useAppSelector']),
    mkEdge('src/pages/Dashboard.tsx', 'src/types/api.ts', ['StatsData', 'UserData']),

    mkEdge('src/pages/Settings.tsx', 'src/components/Button.tsx', ['Button']),
    mkEdge('src/pages/Settings.tsx', 'src/hooks/useTheme.ts', ['useTheme']),
    mkEdge('src/pages/Settings.tsx', 'src/services/storage.ts', ['getSettings', 'saveSettings']),
    mkEdge('src/pages/Settings.tsx', 'src/types/index.ts', ['SettingsType']),

    mkEdge('src/pages/Profile.tsx', 'src/components/Card.tsx', ['Card']),
    mkEdge('src/pages/Profile.tsx', 'src/components/Button.tsx', ['Button']),
    mkEdge('src/pages/Profile.tsx', 'src/hooks/useAuth.ts', ['useAuth']),
    mkEdge('src/pages/Profile.tsx', 'src/services/api.ts', ['updateProfile']),
    mkEdge('src/pages/Profile.tsx', 'src/store/userSlice.ts', ['selectUser']),

    // Hooks
    mkEdge('src/hooks/useAuth.ts', 'src/services/auth.ts', ['login', 'logout']),
    mkEdge('src/hooks/useAuth.ts', 'src/store/userSlice.ts', ['setUser']),
    mkEdge('src/hooks/useFetch.ts', 'src/services/api.ts', ['apiClient']),
    mkEdge('src/hooks/useTheme.ts', 'src/services/storage.ts', ['getTheme']),

    // Services
    mkEdge('src/services/api.ts', 'src/types/api.ts', ['ApiResponse']),
    mkEdge('src/services/api.ts', 'src/utils/helpers.ts', ['createUrl']),
    mkEdge('src/services/auth.ts', 'src/services/api.ts', ['apiClient']),

    // Store
    mkEdge('src/store/index.ts', 'src/store/userSlice.ts', ['userReducer']),
    mkEdge('src/store/index.ts', 'src/types/index.ts', ['RootState']),
    mkEdge('src/store/index.ts', 'src/services/api.ts', ['apiMiddleware']),
    mkEdge('src/store/userSlice.ts', 'src/types/index.ts', ['User']),
    mkEdge('src/store/userSlice.ts', 'src/services/api.ts', ['fetchCurrentUser']),

    // Config
    mkEdge('src/config/routes.ts', 'src/pages/Home.tsx', ['Home'], 'dynamic'),
    mkEdge('src/config/routes.ts', 'src/pages/Dashboard.tsx', ['Dashboard'], 'dynamic'),
    mkEdge('src/config/routes.ts', 'src/pages/Settings.tsx', ['Settings'], 'dynamic'),
    mkEdge('src/config/routes.ts', 'src/pages/Profile.tsx', ['Profile'], 'dynamic'),

    // Tests
    mkEdge('src/__tests__/App.test.tsx', 'src/components/App.tsx', ['App']),
    mkEdge('src/__tests__/App.test.tsx', 'src/store/index.ts', ['store']),
    mkEdge('src/__tests__/App.test.tsx', 'src/hooks/useAuth.ts', ['useAuth']),

    // Utils
    mkEdge('src/utils/validation.ts', 'src/types/index.ts', ['ValidationRule']),

    // CIRCULAR DEP: store → api → store (intentional for testing)
    // Already: store/index.ts → services/api.ts and services/api.ts → types/api.ts
    // Add: services/api.ts → store/index.ts to create cycle
    // Actually this creates: store/index → api → store/index
    // The edges store/index → api and api → store are already there implicitly through auth
  ];

  const folders = [...new Set(nodes.map(n => n.data.folder))];

  return {
    type: 'graphData',
    payload: {
      nodes,
      edges,
      stats: {
        fileCount: nodes.length,
        edgeCount: edges.length,
        orphanCount: 1,
        hasCycles: true,
      },
      folders,
    },
  };
}

function getMockDetections() {
  return {
    type: 'detections',
    payload: {
      issues: [
        { type: 'cycle', severity: 'critical', message: 'Circular dependency: store/index.ts → services/api.ts → store/index.ts', filePaths: ['src/store/index.ts', 'src/services/api.ts'], cycleGroup: 0 },
        { type: 'phantom', severity: 'warning', message: 'Import "./analytics" not found in project', filePaths: ['src/services/api.ts'] },
        { type: 'orphan', severity: 'info', message: 'File has no imports or exports', filePaths: ['src/utils/deprecated.ts'] },
        { type: 'coupling', severity: 'warning', message: 'High coupling between src/components and src/hooks (12 edges)', filePaths: ['src/components', 'src/hooks'] },
        { type: 'shadow', severity: 'info', message: 'Implicit import via barrel file', filePaths: ['src/store/userSlice.ts'] },
      ],
      cycleEdges: [
        { source: 'src/store/index.ts', target: 'src/services/api.ts' },
        { source: 'src/services/api.ts', target: 'src/store/index.ts' },
      ],
      healthScore: 72,
    },
  };
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      console.log('Received:', msg.type);

      if (msg.type === 'webviewReady') {
        // Send graph data
        ws.send(JSON.stringify(getMockGraphData()));
        // Send detections after small delay
        setTimeout(() => {
          ws.send(JSON.stringify(getMockDetections()));
        }, 500);
      }

      if (msg.type === 'copyPrompt') {
        console.log('Copy prompt requested for issue:', msg.payload.issueIndex);
      }
    } catch {
      // ignore
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`DepsView UI test server running at http://localhost:${PORT}`);
});
