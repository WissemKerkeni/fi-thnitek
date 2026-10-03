import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.js';
import { colors, sizes, typography } from './tokens.js';

const AA_TEXT = 4.5;

describe('colour contrast (WCAG AA, ADR-212)', () => {
  const pairs: [string, keyof typeof colors, keyof typeof colors][] = [
    ['body text on background', 'text', 'background'],
    ['body text on surface', 'text', 'surface'],
    ['muted text on surface', 'textMuted', 'surface'],
    ['muted text on background', 'textMuted', 'background'],
    ['primary button label', 'onPrimary', 'primary'],
    ['accent label', 'onAccent', 'accent'],
    ['primary container label', 'onPrimaryContainer', 'primaryContainer'],
    ['primary as text on surface', 'primary', 'surface'],
    ['success badge', 'onStatus', 'success'],
    ['warning badge', 'onStatus', 'warning'],
    ['danger badge', 'onStatus', 'danger'],
    ['danger as text on surface', 'danger', 'surface'],
  ];

  it.each(pairs)('%s ≥ 4.5:1', (_label, fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });

  it('rejects malformed colours', () => {
    expect(() => contrastRatio('blue', '#FFFFFF')).toThrow();
  });
});

describe('sizes (docs/ux.md §4)', () => {
  it('keeps touch targets ≥ 48 and body text ≥ 16', () => {
    expect(sizes.minTouchTarget).toBeGreaterThanOrEqual(48);
    expect(sizes.primaryButtonHeight).toBeGreaterThanOrEqual(48);
    for (const style of Object.values(typography)) expect(style.fontSize).toBeGreaterThanOrEqual(16);
  });
});
