import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as path from 'path';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../shared/protocol.js';

const DEFAULT_PORT = 7890;
let server: ReturnType<typeof createServer> | undefined;
let wss: WebSocketServer | undefined;
const clients = new Set<WebSocket>();
let onMessageCallback: ((msg: WebviewToExtensionMessage) => void) | undefined;

export function setMessageHandler(handler: (msg: WebviewToExtensionMessage) => void): void {
  onMessageCallback = handler;
}

export function broadcastToClients(message: ExtensionToWebviewMessage): void {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function getClientCount(): number {
  return clients.size;
}

export async function startServer(distDir: string, port: number = DEFAULT_PORT): Promise<number> {
  if (server) return port;

  const app = express();
  const webviewDir = path.join(distDir, 'webview');

  // Serve the webview bundle
  app.use('/webview', express.static(webviewDir));

  // Serve media assets (icon, etc.)
  const mediaDir = path.join(distDir, '..', 'media');
  app.use('/media', express.static(mediaDir));

  // Serve the main page
  app.get('/', (_req, res) => {
    res.send(getPageHtml(port));
  });

  server = createServer(app);
  wss = new WebSocketServer({ server });
  wss.on('error', () => { /* handled by http server error */ });

  wss.on('connection', (ws) => {
    clients.add(ws);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WebviewToExtensionMessage;
        onMessageCallback?.(msg);
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  return new Promise((resolve, reject) => {
    server!.listen(port, () => {
      resolve(port);
    });
    server!.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        wss?.close();
        server?.close();
        server = undefined;
        wss = undefined;
        startServer(distDir, port + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

export function stopServer(): void {
  for (const client of clients) {
    client.close();
  }
  clients.clear();
  wss?.close();
  server?.close();
  server = undefined;
  wss = undefined;
}

function getPageHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DepsView</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100vh; overflow: hidden; background: #0a0e17; }
  </style>
  <link rel="stylesheet" href="/webview/webview.css">
</head>
<body>
  <div id="root"></div>
  <script>
    window.__DEPSVIEW_WS_PORT__ = ${port};
    window.__DEPSVIEW_ICON__ = "/media/icon.png";
  </script>
  <script src="/webview/webview.js"></script>
</body>
</html>`;
}
