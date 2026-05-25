/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dynamically overridden at runtime via CSS custom properties set by TenantContext.
        // These defaults reflect THECC+ (yellow/black) but any tenant colour can be applied.
        primary: 'var(--color-primary, #FFD600)',
        'primary-fg': 'var(--color-primary-fg, #000000)',
        secondary: 'var(--color-secondary, #FFFFFF)',
        canvas: 'var(--color-canvas, #000000)',
        surface: 'var(--color-surface, #1A1A1A)',
        'surface-alt': 'var(--color-surface-alt, #111111)',
        border: 'var(--color-border, #2A2A2A)',
        text: 'var(--color-text, #FFFFFF)',
        'text-muted': 'var(--color-text-muted, #AAAAAA)',
        'text-subtle': 'var(--color-text-subtle, #777777)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
