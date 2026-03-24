import { describe, it, expect } from 'vitest';
import { computeHeat, heatToOpacity, heatToGlow } from '../src/webview/utils/heatmap';

describe('computeHeat', () => {
  it('returns 1 for just-modified file', () => {
    const now = Date.now();
    expect(computeHeat(now, now)).toBe(1);
  });

  it('returns ~0.5 after 7 days (half-life)', () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const heat = computeHeat(sevenDaysAgo, now);
    expect(heat).toBeCloseTo(1 / Math.E, 1); // e^-1 ≈ 0.368
  });

  it('returns near 0 for very old files', () => {
    const now = Date.now();
    const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;
    const heat = computeHeat(sixMonthsAgo, now);
    expect(heat).toBeLessThan(0.001);
  });

  it('returns 1 for future mtime', () => {
    const now = Date.now();
    expect(computeHeat(now + 1000, now)).toBe(1);
  });
});

describe('heatToOpacity', () => {
  it('returns min opacity for cold files', () => {
    expect(heatToOpacity(0)).toBe(0.35);
  });

  it('returns max opacity for hot files', () => {
    expect(heatToOpacity(1)).toBe(1);
  });
});

describe('heatToGlow', () => {
  it('returns none for cold files', () => {
    expect(heatToGlow(0.05, '#fff')).toBe('none');
  });

  it('returns glow for hot files', () => {
    const glow = heatToGlow(0.8, '#fff');
    expect(glow).toContain('rgba(255, 140, 0');
  });
});
