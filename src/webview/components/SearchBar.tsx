import React, { useState, useCallback, useRef, useMemo, memo, useEffect } from 'react';
import { COLORS } from '../utils/colors.js';
import type { Node } from '@xyflow/react';
import type { WebviewNodeData } from '../../shared/protocol.js';

function fuzzyMatch(query: string, candidate: string): number | null {
  let qi = 0, score = 0, consecutive = 0;
  const q = query.toLowerCase(), c = candidate.toLowerCase();
  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] === q[qi]) {
      qi++;
      consecutive++;
      score += consecutive * 2 + (ci === 0 || c[ci - 1] === '/' ? 5 : 0);
    } else {
      consecutive = 0;
    }
  }
  return qi === q.length ? score : null;
}

interface SearchBarProps {
  nodes: Node<WebviewNodeData>[];
  onFocusResult: (nodeId: string) => void;
  onHighlight: (nodeIds: Set<string>) => void;
}

function SearchBarComponent({ nodes, onFocusResult, onHighlight }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    if (!query || query.length < 2) return [];
    const results: Array<{ id: string; score: number }> = [];
    for (const node of nodes) {
      if (node.type !== 'file') continue;
      const data = node.data as WebviewNodeData;
      // Try substring first (exact match bonus)
      const lowerPath = data.relativePath.toLowerCase();
      const lowerQuery = query.toLowerCase();
      if (lowerPath.includes(lowerQuery)) {
        results.push({ id: node.id, score: 1000 - lowerPath.indexOf(lowerQuery) });
      } else {
        // Fuzzy fallback
        const score = fuzzyMatch(query, data.relativePath);
        if (score !== null) {
          results.push({ id: node.id, score });
        }
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }, [query, nodes]);

  // Update highlights when matches change
  useEffect(() => {
    if (matches.length > 0) {
      onHighlight(new Set(matches.map(m => m.id)));
    } else if (query.length >= 2) {
      onHighlight(new Set());
    }
  }, [matches]);

  // Reset index when matches change
  useEffect(() => {
    setCurrentIndex(0);
  }, [matches.length]);

  const navigateToMatch = useCallback((index: number) => {
    if (matches.length === 0) return;
    const safeIndex = ((index % matches.length) + matches.length) % matches.length;
    setCurrentIndex(safeIndex);
    onFocusResult(matches[safeIndex].id);
  }, [matches, onFocusResult]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateToMatch(e.shiftKey ? currentIndex - 1 : currentIndex + 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateToMatch(currentIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateToMatch(currentIndex - 1);
    } else if (e.key === 'Escape') {
      setQuery('');
      onHighlight(new Set());
      inputRef.current?.blur();
    }
  }, [navigateToMatch, currentIndex, onHighlight]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (!value) {
      onHighlight(new Set());
    }
  }, [onHighlight]);

  const hasMatches = matches.length > 0;
  const noResults = query.length >= 2 && matches.length === 0;

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search files..."
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        style={{
          background: COLORS.bgCard,
          border: `1px solid ${noResults ? COLORS.violation : hasMatches ? COLORS.borderActive : COLORS.border}`,
          borderRadius: 6,
          padding: '6px 12px',
          paddingRight: hasMatches ? 52 : 12,
          color: COLORS.text,
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          width: 220,
          outline: 'none',
          transition: 'border-color 0.15s ease',
        }}
        onFocus={e => { if (!noResults && !hasMatches) e.currentTarget.style.borderColor = COLORS.borderActive; }}
        onBlur={e => { if (!noResults && !hasMatches) e.currentTarget.style.borderColor = COLORS.border; }}
      />
      {hasMatches && (
        <span style={{
          position: 'absolute',
          right: 8,
          fontSize: 9,
          color: COLORS.textDim,
          fontFamily: "'JetBrains Mono', monospace",
          pointerEvents: 'none',
          background: COLORS.bgCard,
          padding: '1px 4px',
          borderRadius: 3,
        }}>
          {currentIndex + 1}/{matches.length}
        </span>
      )}
    </div>
  );
}

export const SearchBar = memo(SearchBarComponent);
