import { useEffect, useCallback } from 'react';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../../shared/protocol.js';

interface VsCodeApi {
  postMessage(message: WebviewToExtensionMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

// Detect environment: VS Code webview vs browser
let vscodeApi: VsCodeApi | null = null;
let ws: WebSocket | null = null;
const messageListeners = new Set<(msg: ExtensionToWebviewMessage) => void>();

const win = window as unknown as { acquireVsCodeApi?: () => VsCodeApi; __DEPSVIEW_WS_PORT__?: number };

if (typeof win.acquireVsCodeApi === 'function') {
  vscodeApi = win.acquireVsCodeApi();
} else {
  // Running in browser — use WebSocket
  const port = win.__DEPSVIEW_WS_PORT__ ?? 7890;
  connectWebSocket(port);
}

function connectWebSocket(port: number): void {
  const url = `ws://${window.location.hostname}:${port}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    // Send webviewReady as soon as WS is connected
    ws!.send(JSON.stringify({ type: 'webviewReady' }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as ExtensionToWebviewMessage;
      for (const listener of messageListeners) {
        listener(msg);
      }
    } catch {
      // ignore
    }
  };

  ws.onclose = () => {
    setTimeout(() => connectWebSocket(port), 2000);
  };
}

// In VS Code webview, listen via window.addEventListener
if (vscodeApi) {
  window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
    for (const listener of messageListeners) {
      listener(event.data);
    }
  });
}

export function postMessage(message: WebviewToExtensionMessage): void {
  if (vscodeApi) {
    vscodeApi.postMessage(message);
  } else if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function useMessageListener(
  handler: (message: ExtensionToWebviewMessage) => void,
): void {
  const stableHandler = useCallback(handler, [handler]);

  useEffect(() => {
    messageListeners.add(stableHandler);
    return () => {
      messageListeners.delete(stableHandler);
    };
  }, [stableHandler]);
}
