import { DirectedGraph } from 'graphology';
import * as path from 'path';
import * as fs from 'fs';
import type { FileParseResult } from '../parser/types.js';
import type { GraphNodeData, GraphEdgeData } from './types.js';

export function buildDependencyGraph(
  parseResults: FileParseResult[],
  rootDir: string,
): DirectedGraph<GraphNodeData, GraphEdgeData> {
  const graph = new DirectedGraph<GraphNodeData, GraphEdgeData>();
  const normalizedRoot = rootDir.replace(/\\/g, '/');

  // Add all files as nodes
  for (const result of parseResults) {
    const relativePath = path.relative(normalizedRoot, result.filePath).replace(/\\/g, '/');
    const ext = path.extname(result.filePath);

    const stat = fs.statSync(result.filePath);
    graph.addNode(relativePath, {
      filePath: result.filePath,
      relativePath,
      exportCount: result.exports.length,
      importCount: result.imports.length,
      extension: ext,
      lastModifiedMs: stat.mtimeMs,
      fileSize: stat.size,
    });
  }

  // Add edges for resolved imports
  for (const result of parseResults) {
    const sourceRelative = path.relative(normalizedRoot, result.filePath).replace(/\\/g, '/');

    for (const imp of result.imports) {
      if (!imp.resolvedPath) continue;

      const targetRelative = path.relative(normalizedRoot, imp.resolvedPath).replace(/\\/g, '/');

      // Skip self-references and edges to non-existent nodes
      if (sourceRelative === targetRelative) continue;
      if (!graph.hasNode(targetRelative)) continue;

      // One edge per source→target pair (merge specifiers)
      const edgeKey = `${sourceRelative}->${targetRelative}`;
      if (graph.hasEdge(edgeKey)) {
        // Merge specifiers into existing edge
        const existing = graph.getEdgeAttributes(edgeKey);
        const newSpecs = imp.specifiers.map(s => s.alias ?? s.name);
        for (const s of newSpecs) {
          if (!existing.specifiers.includes(s)) {
            existing.specifiers.push(s);
          }
        }
        continue;
      }

      graph.addEdgeWithKey(edgeKey, sourceRelative, targetRelative, {
        specifiers: imp.specifiers.map(s => s.alias ?? s.name),
        kind: imp.kind,
        line: imp.line,
      });
    }
  }

  return graph;
}

/**
 * Remove a node and all its edges from the graph.
 * Returns the list of affected neighbor nodes (for impact recomputation).
 */
export function deleteNode(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
  nodeId: string,
): string[] {
  if (!graph.hasNode(nodeId)) return [];

  // Collect neighbors before removal
  const neighbors = new Set<string>([
    ...graph.inNeighbors(nodeId),
    ...graph.outNeighbors(nodeId),
  ]);

  graph.dropNode(nodeId);
  return [...neighbors];
}

/**
 * Add a new file node to an existing graph and wire up its edges.
 * Returns the list of affected nodes for downstream recomputation.
 */
export function addNode(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
  result: FileParseResult,
  rootDir: string,
): string[] {
  const normalizedRoot = rootDir.replace(/\\/g, '/');
  const relativePath = path.relative(normalizedRoot, result.filePath).replace(/\\/g, '/');
  const ext = path.extname(result.filePath);

  if (graph.hasNode(relativePath)) return [];

  const stat = fs.statSync(result.filePath);
  graph.addNode(relativePath, {
    filePath: result.filePath,
    relativePath,
    exportCount: result.exports.length,
    importCount: result.imports.length,
    extension: ext,
    lastModifiedMs: stat.mtimeMs,
    fileSize: stat.size,
  });

  const affected = new Set<string>([relativePath]);

  // Add outgoing edges
  for (const imp of result.imports) {
    if (!imp.resolvedPath) continue;
    const targetRelative = path.relative(normalizedRoot, imp.resolvedPath).replace(/\\/g, '/');
    if (relativePath === targetRelative) continue;
    if (!graph.hasNode(targetRelative)) continue;

    const edgeKey = `${relativePath}->${targetRelative}`;
    if (!graph.hasEdge(edgeKey)) {
      graph.addEdgeWithKey(edgeKey, relativePath, targetRelative, {
        specifiers: imp.specifiers.map(s => s.alias ?? s.name),
        kind: imp.kind,
        line: imp.line,
      });
      affected.add(targetRelative);
    }
  }

  return [...affected];
}

export interface GraphPatch {
  addedEdges: Array<{ source: string; target: string; key: string; data: GraphEdgeData }>;
  removedEdges: string[];
  updatedNodes: string[];
}

/**
 * Patch an existing graph incrementally for a single changed file.
 * Returns the diff (added/removed edges) for downstream selective updates.
 */
export function patchGraph(
  graph: DirectedGraph<GraphNodeData, GraphEdgeData>,
  changedFile: FileParseResult,
  rootDir: string,
): GraphPatch {
  const normalizedRoot = rootDir.replace(/\\/g, '/');
  const sourceRelative = path.relative(normalizedRoot, changedFile.filePath).replace(/\\/g, '/');

  if (!graph.hasNode(sourceRelative)) return { addedEdges: [], removedEdges: [], updatedNodes: [] };

  // Update node data (export/import counts, mtime)
  const ext = path.extname(changedFile.filePath);
  graph.mergeNodeAttributes(sourceRelative, {
    exportCount: changedFile.exports.length,
    importCount: changedFile.imports.length,
    lastModifiedMs: fs.statSync(changedFile.filePath).mtimeMs,
  });

  // Collect old outgoing edges from this file
  const oldEdgeKeys = new Set<string>();
  graph.forEachOutEdge(sourceRelative, (edgeKey) => {
    oldEdgeKeys.add(edgeKey);
  });

  // Build new edges from updated imports
  const newEdges = new Map<string, { target: string; data: GraphEdgeData }>();
  for (const imp of changedFile.imports) {
    if (!imp.resolvedPath) continue;
    const targetRelative = path.relative(normalizedRoot, imp.resolvedPath).replace(/\\/g, '/');
    if (sourceRelative === targetRelative) continue;
    if (!graph.hasNode(targetRelative)) continue;

    const edgeKey = `${sourceRelative}->${targetRelative}`;
    const existing = newEdges.get(edgeKey);
    if (existing) {
      const newSpecs = imp.specifiers.map(s => s.alias ?? s.name);
      for (const s of newSpecs) {
        if (!existing.data.specifiers.includes(s)) existing.data.specifiers.push(s);
      }
    } else {
      newEdges.set(edgeKey, {
        target: targetRelative,
        data: {
          specifiers: imp.specifiers.map(s => s.alias ?? s.name),
          kind: imp.kind,
          line: imp.line,
        },
      });
    }
  }

  // Diff: find removed and added edges
  const removedEdges: string[] = [];
  const addedEdges: GraphPatch['addedEdges'] = [];
  const updatedNodes = new Set<string>([sourceRelative]);

  // Remove edges that no longer exist
  for (const oldKey of oldEdgeKeys) {
    if (!newEdges.has(oldKey)) {
      const target = graph.target(oldKey);
      updatedNodes.add(target);
      removedEdges.push(oldKey);
      graph.dropEdge(oldKey);
    }
  }

  // Add new edges or update existing
  for (const [edgeKey, { target, data }] of newEdges) {
    if (oldEdgeKeys.has(edgeKey)) {
      // Update specifiers on existing edge
      graph.replaceEdgeAttributes(edgeKey, data);
    } else {
      // New edge
      graph.addEdgeWithKey(edgeKey, sourceRelative, target, data);
      addedEdges.push({ source: sourceRelative, target, key: edgeKey, data });
      updatedNodes.add(target);
    }
  }

  return { addedEdges, removedEdges, updatedNodes: [...updatedNodes] };
}
