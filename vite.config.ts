import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Vite configuration for thecc-pt-portal.
 *
 * ── React Native Web aliases ────────────────────────────────────────────────
 *
 * The portal's live preview panel renders the same CoachProfileView component
 * as the thecc-plus-app mobile app via react-native-web (AC-3, PRD v0.4).
 *
 * Cross-repo import strategy: LOCAL COPY (temporary)
 * ─────────────────────────────────────────────────────────────
 * The original plan used a Vite alias pointing at the sibling mobile repo:
 *   ../thecc-plus-app/src/components/coach/CoachProfileView.tsx
 *
 * That worked locally but FAILED on Vercel because CI only clones this repo —
 * the sibling repo doesn't exist in the build environment. Build error 2026-05-25:
 *   "Cannot find module '@mobile/coach/CoachProfileView'"
 *
 * Pragmatic fix: copied CoachProfileView.tsx + theme/tokens.ts into
 * src/mobile-shared/ so the portal is self-contained. Two source-of-truth
 * copies exist now (mobile repo + portal copy) — they must be kept in sync
 * manually until a proper npm workspace or shared package is set up.
 *
 * Follow-up (TODO next session): extract CoachProfileView + tokens into a
 * private npm workspace so both repos consume the same source.
 *
 * The alias chain:
 *   react-native         → react-native-web  (RNW handles all RN primitives)
 *   expo-image           → src/shims/expo-image.tsx  (thin <img> wrapper)
 *   @expo/vector-icons   → src/shims/expo-vector-icons.tsx  (Ionicons via TTF)
 *   expo-font            → src/shims/expo-font.ts  (no-op stub)
 *   @mobile/coach        → src/mobile-shared/coach/  (local copy)
 *   @mobile/theme        → src/mobile-shared/theme/  (local copy)
 */

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Core RNW alias — all react-native imports go through react-native-web
      'react-native': 'react-native-web',

      // Expo shims (order matters — more specific first)
      'expo-image': path.resolve(__dirname, 'src/shims/expo-image.tsx'),
      'expo-font': path.resolve(__dirname, 'src/shims/expo-font.ts'),
      '@expo/vector-icons': path.resolve(__dirname, 'src/shims/expo-vector-icons.tsx'),

      // Mobile-shared aliases — local copies of mobile source for Vercel build
      '@mobile/coach': path.resolve(__dirname, 'src/mobile-shared/coach'),
      '@mobile/theme': path.resolve(__dirname, 'src/mobile-shared/theme'),
    },
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.jsx', '.web.js', '.jsx', '.js'],
  },
  optimizeDeps: {
    include: ['react-native-web'],
    exclude: ['@mobile/coach', '@mobile/theme'],
  },
});
