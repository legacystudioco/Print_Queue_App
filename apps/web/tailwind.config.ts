import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Electric blue — extracted from the 3D Sports Displays badge accent
        // lines. Secondary: links, informational states, "ready on printer".
        brand: {
          50: '#eaf4fd',
          100: '#cfe6fa',
          200: '#9fcbf5',
          300: '#66aaee',
          400: '#3b90e4',
          500: '#1479d6',
          600: '#0e62b3',
          700: '#0c4e8f',
          800: '#0d3f72',
          900: '#0e355e',
        },
        // Safety orange — extracted from the badge's "DISPLAYS" wordmark and
        // accent chevrons (raw sample: #ed6114). Primary: CTAs, active/
        // in-progress state, current queue item, progress, notifications.
        // Used deliberately sparingly.
        //
        // 500 is deepened from the raw #ed6114 sample specifically so white
        // text on an accent-500 fill clears WCAG AA (4.97:1) — the literal
        // logo orange only manages 3.32:1, which fails for button/badge
        // text. 400 keeps the brighter, more literal logo hue for
        // decorative/non-text uses (hover tints, thin accents).
        accent: {
          50: '#fff3ea',
          100: '#ffe1cc',
          200: '#ffc199',
          300: '#ff9d66',
          400: '#f87f3d',
          500: '#c24807',
          600: '#a23c06',
          700: '#832f05',
          800: '#682604',
          900: '#541e03',
        },
        // Matte black / brushed-charcoal — extracted from the badge's panel
        // and background. Dark chrome: nav, footers, machined-metal surfaces.
        // 950 is a pixel-exact match to the official logo artwork's own
        // background (public/logo/mark.png et al.) so the navbar mark
        // composites onto it with no visible seam.
        charcoal: {
          50: '#f5f5f6',
          100: '#e7e8e9',
          200: '#d1d2d4',
          300: '#aeb0b3',
          400: '#85878b',
          500: '#636568',
          600: '#4a4b4e',
          700: '#38393b',
          800: '#2a2b2d',
          900: '#1d1d1f',
          950: '#171717',
        },
        danger: {
          50: '#fef2f2',
          100: '#fde2e2',
          500: '#e11d2e',
          600: '#c5121f',
          700: '#9f0f1a',
        },
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#16a34a',
          600: '#15803d',
          700: '#0f6a30',
        },
      },
      fontSize: {
        'display-lg': ['2.5rem', { lineHeight: '1.1', fontWeight: '700' }],
      },
      boxShadow: {
        panel: '0 1px 2px 0 rgb(13 13 14 / 0.04), 0 1px 3px 0 rgb(13 13 14 / 0.06)',
        'panel-lift': '0 4px 10px -2px rgb(13 13 14 / 0.1), 0 2px 4px -2px rgb(13 13 14 / 0.06)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
