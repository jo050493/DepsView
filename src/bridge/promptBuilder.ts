import type { DetectionIssue, ScanResult } from '../graph/types.js';
import { getPromptTemplate, type PromptContext } from './templates.js';
import { buildAdjacencyList } from './generator.js';

export function buildFixPrompt(
  issue: DetectionIssue,
  scanResult: ScanResult,
  impactScores: Map<string, number>,
): string {
  const dependencyTree = buildAdjacencyList(scanResult);

  // Find the highest-impact file in this issue
  let highImpactFile: string | undefined;
  let highImpactDependents = 0;

  for (const fp of issue.filePaths) {
    const score = impactScores.get(fp) ?? 0;
    if (score > highImpactDependents) {
      highImpactDependents = score;
      highImpactFile = fp;
    }
  }

  const ctx: PromptContext = {
    dependencyTree,
    issueDescription: issue.message,
    affectedFiles: issue.filePaths,
    impactCount: issue.filePaths.reduce((sum, fp) => sum + (impactScores.get(fp) ?? 0), 0),
    highImpactFile,
    highImpactDependents,
  };

  const template = getPromptTemplate(issue.type);
  return template(ctx);
}
