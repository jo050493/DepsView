import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { setGrammarDir } from '../parser/treeSitter.js';
import { scanProject } from '../parser/scanner.js';
import { buildDependencyGraph } from '../graph/builder.js';
import { serializeGraph } from '../graph/serializer.js';
import { serve } from './serve.js';

const program = new Command();

program
  .name('depsview')
  .description('Real-time dependency graph for your codebase')
  .version('0.1.0');

program
  .command('scan')
  .description('Scan a project directory and output the dependency graph as JSON')
  .argument('<directory>', 'Directory to scan')
  .option('-o, --output <file>', 'Write JSON output to file instead of stdout')
  .option('-p, --pretty', 'Pretty-print JSON output')
  .action(async (directory: string, options: { output?: string; pretty?: boolean }) => {
    const absDir = path.resolve(directory);

    if (!fs.existsSync(absDir)) {
      console.error(`Error: Directory not found: ${absDir}`);
      process.exit(1);
    }

    // Set grammar dir relative to this script
    const grammarDir = path.join(__dirname, 'grammars');
    if (fs.existsSync(grammarDir)) {
      setGrammarDir(grammarDir);
    } else {
      // Fallback for dev: use project root grammars/
      const devGrammarDir = path.join(__dirname, '..', 'grammars');
      if (fs.existsSync(devGrammarDir)) {
        setGrammarDir(devGrammarDir);
      }
    }

    console.error(`Scanning ${absDir}...`);

    const results = await scanProject(absDir);
    const graph = buildDependencyGraph(results, absDir);
    const scanResult = serializeGraph(graph, absDir);

    const json = options.pretty
      ? JSON.stringify(scanResult, null, 2)
      : JSON.stringify(scanResult);

    if (options.output) {
      fs.writeFileSync(options.output, json, 'utf-8');
      console.error(`Output written to ${options.output}`);
    } else {
      console.log(json);
    }

    console.error(`\nSummary:`);
    console.error(`  Files: ${scanResult.stats.fileCount}`);
    console.error(`  Dependencies: ${scanResult.stats.edgeCount}`);
    console.error(`  Orphans: ${scanResult.stats.orphanCount}`);
    console.error(`  Cycles: ${scanResult.stats.hasCycles ? 'YES' : 'none'}`);
  });

program
  .command('serve')
  .description('Start a standalone browser server with live file watching')
  .argument('[directory]', 'Directory to scan', '.')
  .option('-p, --port <port>', 'Server port', '7890')
  .action(async (directory: string, options: { port: string }) => {
    await serve(directory, parseInt(options.port, 10));
  });

program.parse();
