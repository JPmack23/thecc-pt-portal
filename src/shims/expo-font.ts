/**
 * expo-font web shim
 *
 * Aliased via Vite so that any transitive imports of expo-font from
 * @expo/vector-icons don't cause build failures. Our Ionicons shim
 * handles font loading directly via @font-face injection, so this
 * stub just needs to not crash.
 */

export async function loadAsync(_fontMap: Record<string, unknown>): Promise<void> {
  // No-op: fonts are loaded via @font-face injection in expo-vector-icons.tsx
}

export function isLoaded(_fontFamily: string): boolean {
  return true;
}

export function isLoading(_fontFamily: string): boolean {
  return false;
}

export async function renderToImageAsync(): Promise<null> {
  return null;
}
