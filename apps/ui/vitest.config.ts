import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx,js,jsx}',
        'src/test/**',
        'src/index.jsx',
        'src/main.jsx',
        'src/**/*.d.ts',
      ],
      // Sprint 2 floor: 0% — establishes the infrastructure. Sprint 3
      // ratchets up based on actual coverage observed in CI.
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
});
