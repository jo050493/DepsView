import { useState, useCallback } from 'react';
import type { ExtensionToWebviewMessage, DetectionsMessage } from '../../shared/protocol.js';
import { useMessageListener } from './useVscodeMessaging.js';

export function useDetections(): DetectionsMessage['payload'] | null {
  const [detections, setDetections] = useState<DetectionsMessage['payload'] | null>(null);

  const handleMessage = useCallback((message: ExtensionToWebviewMessage) => {
    if (message.type === 'detections') {
      setDetections(message.payload);
    }
  }, []);

  useMessageListener(handleMessage);

  return detections;
}
