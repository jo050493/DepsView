const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Compute a heat value from 0 (cold) to 1 (hot) based on file modification time.
 * Uses exponential decay with a 7-day half-life.
 */
export function computeHeat(
  lastModifiedMs: number,
  nowMs: number = Date.now(),
): number {
  const ageMs = nowMs - lastModifiedMs;
  if (ageMs <= 0) return 1;
  return Math.exp(-ageMs / HALF_LIFE_MS);
}

/**
 * Convert heat (0-1) to an opacity value (0.35 min - 1.0 max).
 */
export function heatToOpacity(heat: number): number {
  return 0.35 + heat * 0.65;
}

/**
 * Convert heat (0-1) to a glow CSS box-shadow string.
 * Returns empty string for cold files.
 */
export function heatToGlow(heat: number, baseColor: string): string {
  if (heat < 0.1) return 'none';
  const intensity = Math.round(heat * 12);
  const alpha = (heat * 0.6).toFixed(2);
  return `0 0 ${intensity}px rgba(255, 140, 0, ${alpha})`;
}
