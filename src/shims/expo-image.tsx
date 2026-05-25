/**
 * expo-image web shim
 *
 * The mobile app imports `Image` from `expo-image`. On web (via RNW preview),
 * Vite aliases `expo-image` → this file. We render a plain <img> that matches
 * the expo-image API surface used by CoachProfileView:
 *   - source: { uri: string }
 *   - style: ViewStyle / ImageStyle (passed through)
 *   - contentFit: 'cover' | 'contain' | 'fill' (mapped to objectFit)
 *   - transition: number (ignored on web — CSS handles transitions natively)
 *
 * This is NOT a full expo-image polyfill. It only covers the props that
 * CoachProfileView.tsx actually uses.
 */

import React from 'react';

interface ExpoImageProps {
  source: { uri: string } | number;
  style?: React.CSSProperties | Record<string, unknown>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  /**
   * contentPosition mirrors expo-image's prop (e.g. 'top', 'center', 'bottom').
   * Maps directly to CSS objectPosition on the web shim so the hero image
   * keeps faces visible when the source is taller than the display area.
   */
  contentPosition?: string;
  transition?: number;
  alt?: string;
  [key: string]: unknown;
}

export function Image({ source, style, contentFit = 'cover', contentPosition = 'top', alt = '' }: ExpoImageProps) {
  const uri = typeof source === 'object' && source !== null && 'uri' in source
    ? (source as { uri: string }).uri
    : undefined;

  if (!uri) return null;

  return (
    <img
      src={uri}
      alt={alt}
      style={{
        ...(style as React.CSSProperties),
        objectFit: contentFit as React.CSSProperties['objectFit'],
        objectPosition: contentPosition,
      }}
    />
  );
}

// Named export to match `import { Image } from 'expo-image'`
export default Image;
