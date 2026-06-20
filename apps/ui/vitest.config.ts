import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    // The full suite runs ~65s on a loaded CI runner (import alone ~50s),
    // which leaves vitest's 5s per-test default with almost no headroom —
    // a single user-interaction test tipped past it and gated a deploy.
    // 15s gives genuine margin without masking real hangs.
    testTimeout: 15000,
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
      // Ratchet floor. vitest 4 made v8 AST-aware remapping
      // (ast-v8-to-istanbul) the default; it counts coverage more
      // conservatively than vitest 3's raw v8 mapping, so the SAME tests now
      // report ~23.8% lines (was ~31% under vitest 3 — see the bump in #150).
      // Floor re-based 30 -> 22 to match the new measurement; this is a
      // counting change, not a coverage regression. #152 ratchets it back up
      // as real tests are added. Functions/branches/statements stay at 0
      // pending that work.
      thresholds: {
        lines: 22,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
});
