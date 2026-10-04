/**
 * Design tokens from the approved Stitch design system "Fi Thnitek Transit System" (docs/ux.md §5),
 * with the ADR-212 palette: deep blue primary + sunny yellow accent instead of Stitch's green; green /
 * amber / red only for status (visible, warning, stop). Type is Inter (Arabic falls back to the system
 * Arabic face).
 */
export const colors = {
  primary: '#0B4A8B',
  onPrimary: '#FFFFFF',
  primaryContainer: '#DCE8F7',
  onPrimaryContainer: '#062B52',
  accent: '#FFC629',
  onAccent: '#1D1A10',
  accentContainer: '#FFF3CC',
  /** Stitch "Neutral" #0F172A: headings and body text. */
  text: '#0F172A',
  textMuted: '#475569',
  background: '#F3F5FA',
  surface: '#FFFFFF',
  /** Tinted fills: chips, secondary buttons, banners, inner cards. */
  surfaceVariant: '#E8EDF7',
  onSurfaceVariant: '#334155',
  border: '#D5DCE6',
  success: '#1B6E33',
  successContainer: '#E3F4E8',
  warning: '#8A5300',
  warningContainer: '#FFF1D6',
  danger: '#B42318',
  dangerContainer: '#FDECEC',
  onStatus: '#FFFFFF',
  scrim: 'rgba(15,23,42,0.45)',
} as const;

export type ColorToken = keyof typeof colors;

/** docs/ux.md §4: touch targets ≥ 48 dp, body text ≥ 16 sp. */
export const sizes = {
  minTouchTarget: 48,
  primaryButtonHeight: 56,
  iconButton: 48,
} as const;

/** Inter weights loaded at startup (app/_layout.tsx). */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const typography = {
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontWeight: '600', fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.semibold, fontWeight: '600', fontSize: 16, lineHeight: 20 },
  headline: { fontFamily: fonts.bold, fontWeight: '700', fontSize: 20, lineHeight: 28 },
  title: { fontFamily: fonts.bold, fontWeight: '700', fontSize: 24, lineHeight: 32 },
  display: { fontFamily: fonts.bold, fontWeight: '700', fontSize: 32, lineHeight: 40 },
} as const;

/**
 * Secondary lines only (the other-language name, a subtitle under a title, a chip): never body text,
 * which stays ≥ 16 sp.
 */
export const caption = { fontFamily: fonts.medium, fontWeight: '500', fontSize: 14, lineHeight: 18 } as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** One soft elevation for floating elements over the map (cards, buttons, sheets). */
export const elevation = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.12,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
} as const;

export const theme = { colors, sizes, fonts, typography, caption, spacing, radii, elevation } as const;
export type Theme = typeof theme;
