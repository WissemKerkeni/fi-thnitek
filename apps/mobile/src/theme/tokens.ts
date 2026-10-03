/**
 * Design tokens (ADR-212): deep blue primary + sunny yellow accent. Green / amber / red are reserved for
 * status (visible, warning, stop). Layout follows the approved Stitch screens (docs/ux.md §5).
 */
export const colors = {
  primary: '#0B4A8B',
  onPrimary: '#FFFFFF',
  primaryContainer: '#DCE8F7',
  onPrimaryContainer: '#062B52',
  accent: '#FFC629',
  onAccent: '#1D1A10',
  background: '#F6F7F9',
  surface: '#FFFFFF',
  text: '#141922',
  textMuted: '#4B5563',
  border: '#D3D9E1',
  success: '#1B6E33',
  warning: '#8A5300',
  danger: '#B42318',
  onStatus: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof colors;

/** docs/ux.md §4: touch targets ≥ 48 dp, body text ≥ 16 sp. */
export const sizes = {
  minTouchTarget: 48,
  primaryButtonHeight: 56,
} as const;

export const typography = {
  body: { fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  label: { fontSize: 16, lineHeight: 20, fontWeight: '600' },
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radii = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

export const theme = { colors, sizes, typography, spacing, radii } as const;
export type Theme = typeof theme;
