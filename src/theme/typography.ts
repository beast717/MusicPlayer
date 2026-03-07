import { TextStyle } from 'react-native';

const typographyStyles = {
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.37,
  } as TextStyle,
  title1: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.36,
  } as TextStyle,
  title2: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.35,
  } as TextStyle,
  title3: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.38,
  } as TextStyle,
  headline: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.41,
  } as TextStyle,
  body: {
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.41,
  } as TextStyle,
  callout: {
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: -0.32,
  } as TextStyle,
  subheadline: {
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.24,
  } as TextStyle,
  footnote: {
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: -0.08,
  } as TextStyle,
  caption1: {
    fontSize: 12,
    fontWeight: '400',
  } as TextStyle,
  caption2: {
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: 0.07,
  } as TextStyle,
} as const;

export type TypographyKey = keyof typeof typographyStyles;
export const typography: Record<TypographyKey, TextStyle> = typographyStyles;
