import { useState, useCallback } from 'react';
import type { ExtensionToWebviewMessage } from '../../shared/protocol.js';
import { useMessageListener } from './useVscodeMessaging.js';

export function useActiveFile(): string | null {
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const handleMessage = useCallback((message: ExtensionToWebviewMessage) => {
    if (message.type === 'activeFileChanged') {
      setActiveFile(message.payload.relativePath);
    }
  }, []);

  useMessageListener(handleMessage);

  return activeFile;
}
