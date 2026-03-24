import * as path from 'path';
import { startMcpServer } from './server.js';

const args = process.argv.slice(2);

let projectDir = '.';
const projectIdx = args.indexOf('--project');
if (projectIdx !== -1 && args[projectIdx + 1]) {
  projectDir = args[projectIdx + 1];
}

const resolvedDir = path.resolve(projectDir);

startMcpServer(resolvedDir).catch(err => {
  process.stderr.write(`DepsView MCP server error: ${err.message}\n`);
  process.exit(1);
});
