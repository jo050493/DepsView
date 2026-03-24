import { parentPort, workerData } from 'worker_threads';
import { scanProject } from '../parser/scanner.js';

interface WorkerInput {
  rootDir: string;
  grammarDir: string;
}

async function run() {
  const { rootDir, grammarDir } = workerData as WorkerInput;
  try {
    const results = await scanProject(rootDir, grammarDir);
    // FileParseResult contains Tree-sitter trees that can't cross thread boundaries
    // Serialize to plain objects (trees are already deleted in scanProject)
    parentPort?.postMessage({ type: 'result', data: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    parentPort?.postMessage({ type: 'error', error: message });
  }
}

run();
