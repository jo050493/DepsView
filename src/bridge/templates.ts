import type { IssueType } from '../graph/types.js';

export interface PromptContext {
  dependencyTree: string;
  issueDescription: string;
  affectedFiles: string[];
  impactCount: number;
  highImpactFile?: string;
  highImpactDependents?: number;
}

const TEMPLATES: Record<IssueType, (ctx: PromptContext) => string> = {
  cycle: (ctx) => `Context: Project architecture:
${ctx.dependencyTree}

Problem: Circular dependency detected.
${ctx.issueDescription}
Impact: ${ctx.impactCount} files affected.
${ctx.highImpactFile ? `Constraint: Do not change the public API of ${ctx.highImpactFile} (used by ${ctx.highImpactDependents} files).` : ''}
Action: Propose a refactoring that breaks this cycle. Suggest which module should own the shared logic, and how to restructure imports to eliminate the circular dependency.`,

  phantom: (ctx) => `Context: Project architecture:
${ctx.dependencyTree}

Problem: Phantom import detected (import points to non-existent export).
${ctx.issueDescription}
Files involved: ${ctx.affectedFiles.join(', ')}
Action: Either create the missing export, fix the import path, or remove the unused import. Show the exact code changes needed.`,

  orphan: (ctx) => `Context: Project architecture:
${ctx.dependencyTree}

Problem: Orphaned files detected (not imported by any other file).
Files: ${ctx.affectedFiles.join(', ')}
Action: For each file, determine if it should be: (1) imported somewhere, (2) deleted as dead code, or (3) kept as an entry point. Explain your reasoning.`,

  coupling: (ctx) => `Context: Project architecture:
${ctx.dependencyTree}

Problem: Excessive coupling detected.
${ctx.issueDescription}
Impact: ${ctx.impactCount} files affected.
Action: Propose a refactoring to reduce coupling. Consider: extracting a facade, splitting the file into focused modules, or introducing an abstraction layer.`,
};

export function getPromptTemplate(type: IssueType): (ctx: PromptContext) => string {
  return TEMPLATES[type];
}
