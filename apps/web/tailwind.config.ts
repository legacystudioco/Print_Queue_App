import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#bcdcff',
          300: '#8ec6ff',
          400: '#59a6ff',
          500: '#3182f6',
          600: '#1c63e6',
          700: '#174ec2',
          800: '#18419b',
          900: '#193a7a',
        },
        danger: {
          50: '#fef2f2',
          500: '#e11d2e',
          600: '#c5121f',
        },
        success: {
          50: '#f0fdf4',
          500: '#16a34a',
          600: '#15803d',
        },
      },
      fontSize: {
        'display-lg': ['2.5rem', { lineHeight: '1.1', fontWeight: '700' }],
      },
    },
  },
  plugins: [],
};

export default config;
