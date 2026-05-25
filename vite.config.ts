import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Vite configuration for thecc-pt-portal.
 *
 * ── React Native Web aliases ────────────────────────────────────────────────
 *
 * The portal's live preview panel renders the ACTUAL CoachProfileView.tsx from
 * the thecc-plus-app mobile repo via react-native-web (AC-3, PRD v0.4).
 *
 * Cross-repo import strategy: Vite path alias (chosen approach)
 * ─────────────────────────────────────────────────────────────
 * The mobile component lives at a sibling path on disk:
 *   ../thecc-plus-app/src/components/coach/CoachProfileView.tsx
 *
 * We resolve it via a Vite alias rather than an npm workspace or symlink.
 * Rationale:
 *   - Zero npm workspace overhead (no package.json changes in either repo)
 *   - Single source of truth: any edit to CoachProfileView.tsx is immediately
 *     reflected in the portal preview with no intermediate copy step
 *   - Works reliably on Windows (no symlink permission issues)
 *   - Simple to document and understand
 *
 * Trade-off: The alias path is absolute on this machine. If the repo is moved,
 * update MOBILE_REPO_ROOT below. A future npm workspace extraction is the
 * correct long-term solution if more shared components are added.
 *
 * The alias chain:
 *   react-native         → react-native-web  (RNW handles all RN primitives)
 *   expo-image           → src/shims/expo-image.tsx  (thin <img> wrapper)
 *   @expo/vector-icons   → src/shims/expo-vector-icons.tsx  (Ionicons via TTF)
 *   expo-font            → src/shims/expo-font.ts  (no-op stub)
 *   @mobile/coach        → ../thecc-plus-app/src/components/coach/
 *   @mobile/theme        → ../thecc-plus-app/src/theme/
 */

// Absolute path to the mobile repo on disk.
// Update this if the repo folder is moved.
const MOBILE_REPO_ROOT = path.resolve(
  __dirname,
  '../thecc-plus-app',
);

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

      // Cross-repo aliases — mobile source files imported directly
      '@mobile/coach': path.join(MOBILE_REPO_ROOT, 'src/components/coach'),
      '@mobile/theme': path.join(MOBILE_REPO_ROOT, 'src/theme'),
    },
    // Vite needs to know .tsx/.ts extensions in the mobile repo
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.jsx', '.web.js', '.jsx', '.js'],
  },
  optimizeDeps: {
    // Pre-bundle RNW so Vite doesn't re-process it on every HMR
    include: ['react-native-web'],
    // Exclude shim files from pre-bundling (they import local aliases)
    exclude: ['@mobile/coach', '@mobile/theme'],
  },
});
