export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  xxxxl: 64,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const fontSizes = {
  xs: 11,
  sm: 12,
  md: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  display: 40,
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

export const lineHeights = {
  tight: 1.2,
  snug: 1.3,
  normal: 1.5,
  relaxed: 1.6,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 14,
    elevation: 6,
  },
} as const;

export const fonts = {
  heading: 'FilsonPro_Heavy',
  headingFallback: 'System',
  body: 'Inter_Regular',
  bodyMedium: 'Inter_Medium',
  bodySemibold: 'Inter_SemiBold',
  bodyBold: 'Inter_Bold',
  bodyFallback: 'System',
  mono: 'JetBrainsMono_Regular',
  monoFallback: 'Courier',
} as const;

export const typography = {
  display: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.display,
    lineHeight: fontSizes.display * lineHeights.tight,
    fontWeight: fontWeights.heavy,
  },
  h1: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.xxxl,
    lineHeight: fontSizes.xxxl * lineHeights.tight,
    fontWeight: fontWeights.heavy,
  },
  h2: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.xxl,
    lineHeight: fontSizes.xxl * lineHeights.snug,
    fontWeight: fontWeights.heavy,
  },
  h3: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.xl,
    lineHeight: fontSizes.xl * lineHeights.snug,
    fontWeight: fontWeights.bold,
  },
  h4: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.lg,
    lineHeight: fontSizes.lg * lineHeights.snug,
    fontWeight: fontWeights.bold,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: fontSizes.base,
    lineHeight: fontSizes.base * lineHeights.normal,
    fontWeight: fontWeights.regular,
  },
  bodySmall: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    lineHeight: fontSizes.md * lineHeights.normal,
    fontWeight: fontWeights.regular,
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm * lineHeights.normal,
    fontWeight: fontWeights.medium,
  },
  overline: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    lineHeight: fontSizes.xs * lineHeights.normal,
    fontWeight: fontWeights.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
    lineHeight: fontSizes.md * lineHeights.snug,
    fontWeight: fontWeights.medium,
  },
  button: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.base,
    lineHeight: fontSizes.base * lineHeights.snug,
    fontWeight: fontWeights.semibold,
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.base,
    lineHeight: fontSizes.base * lineHeights.normal,
    fontWeight: fontWeights.regular,
  },
} as const;

export type Spacing = keyof typeof spacing;
export type Radius = keyof typeof radius;
export type ShadowKey = keyof typeof shadows;
export type TypographyKey = keyof typeof typography;
