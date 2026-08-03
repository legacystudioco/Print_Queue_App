import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Needed to transform JSX in .test.tsx files (e.g. LocalTime.test.tsx,
  // which uses react-dom/server's renderToString — that doesn't need a DOM,
  // so the default 'node' test environment below still applies).
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'src/_archived/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
      'server-only': path.resolve(dirname, './test/stubs/server-only.ts'),
    },
  },
});
