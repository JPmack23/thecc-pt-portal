/**
 * @expo/vector-icons web shim
 *
 * The mobile app imports `{ Ionicons }` from `@expo/vector-icons`. On web (via RNW
 * preview), Vite aliases `@expo/vector-icons` → this file.
 *
 * Strategy:
 *   1. Import the Ionicons TTF directly from node_modules as a Vite asset URL.
 *   2. On first render, inject a @font-face rule into the document <head>.
 *   3. Render each icon as a <Text> element (RNW maps to <span>) using the
 *      unicode codepoint from the Ionicons glyph map.
 *
 * This covers exactly the Ionicons API surface used by CoachProfileView:
 *   <Ionicons name="..." size={n} color="..." style={...} />
 *
 * Only the icons actually used by CoachProfileView are included in the glyph
 * table below — adding more is trivial (copy the codepoint from Ionicons.json).
 */

import { useEffect } from 'react';
import { Text } from 'react-native';
// Vite ?url import: resolves the TTF to a hashed asset URL at build time.
// We use a path relative to this shim file (../../node_modules/...) to bypass
// the @expo/vector-icons Vite alias which points back at this file.
import ioniconsFont from '../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf?url';

// ── Glyph table (subset — only icons used by CoachProfileView) ────────────
// Codepoints sourced from:
//   node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json

const IONICONS_GLYPHS: Record<string, number> = {
  // Used in CoachProfileView hero section
  'person':                  62629,
  'location':                62404,
  // Specialty grid
  'restaurant-outline':      62834,
  'fitness-outline':         62155,
  'medical-outline':         62568,
  'barbell-outline':         61811,
  'brain':                   62003,
  'flash-outline':           62174,
  'trending-down-outline':   63022,
  'body-outline':            61944,
  'star-outline':            62873,
  // Deal card
  'pricetag':                62720,
  // Contact / socials
  'mail-outline':            62516,
  'call-outline':            61837,
  'chevron-forward':         62049,
  'globe-outline':           62240,
  'logo-instagram':          62401,
  'logo-tiktok':             63062,
  'logo-facebook':           62396,
  'logo-youtube':            63113,
  'open-outline':            62648,
  // Achievements
  'trophy-outline':          62978,
  // Book CTA
  'calendar-outline':        61839,
};

let fontInjected = false;

function injectFont() {
  if (fontInjected || typeof document === 'undefined') return;
  fontInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'ionicons';
      src: url('${ioniconsFont}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
  `;
  document.head.appendChild(style);
}

// ── Ionicons component ────────────────────────────────────────────────────

interface IoniconsProps {
  name: string;
  size?: number;
  color?: string;
  style?: Record<string, unknown>;
  [key: string]: unknown;
}

export function Ionicons({ name, size = 24, color = '#000000', style }: IoniconsProps) {
  useEffect(() => {
    injectFont();
  }, []);

  const codepoint = IONICONS_GLYPHS[name];
  const char = codepoint ? String.fromCodePoint(codepoint) : '•';

  return (
    <Text
      style={{
        fontFamily: 'ionicons',
        fontSize: size,
        color,
        lineHeight: size,
        ...(style as Record<string, unknown>),
      }}
      selectable={false}
    >
      {char}
    </Text>
  );
}

// Default export for `import Ionicons from '@expo/vector-icons/Ionicons'`
export default { Ionicons };
