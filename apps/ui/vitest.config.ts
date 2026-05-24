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
      // Sprint 3 floor: lines ratcheted to 30% based on actual coverage
      // (current: ~31% lines, ~75% branches, ~60% funcs, ~31% statements).
      // Functions/branches/statements kept at 0% — they'll ratchet in a
      // follow-up once we're confident the lines gate is sticky in CI.
      thresholds: {
        lines: 30,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
});
