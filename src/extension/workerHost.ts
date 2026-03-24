import { Worker } from 'worker_threads';
import * as path from 'path';
import type { FileParseResult } from '../parser/types.js';

/**
 * Run file scanning in a worker thread to keep the main thread responsive.
 * Falls back to direct scan if the worker fails (e.g. WASM issues in some environments).
 */
export function runScanInWorker(
  rootDir: string,
  grammarDir: string,
): Promise<FileParseResult[]> {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'scanWorker.js');
    const worker = new Worker(workerPath, {
      workerData: { rootDir, grammarDir },
    });

    worker.on('message', (msg: { type: string; data?: FileParseResult[]; error?: string }) => {
      if (msg.type === 'result' && msg.data) {
        resolve(msg.data);
      } else if (msg.type === 'error') {
        reject(new Error(msg.error ?? 'Worker scan failed'));
      }
      worker.terminate();
    });

    worker.on('error', (err) => {
      reject(err);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}
