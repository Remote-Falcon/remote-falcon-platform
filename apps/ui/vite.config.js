import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import eslint from 'vite-plugin-eslint2';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(),eslint()],
  resolve: {
    alias: {
      // The default moment-timezone entry bundles the full IANA history
      // (~727KB of packed zone data). The UI only ever formats dates within
      // stats retention (18 months), so the 10-year-range build (current
      // year ±5) is equivalent here and ~13x smaller. Alias applies to all
      // 16 importing files without touching them.
      'moment-timezone': 'moment-timezone/builds/moment-timezone-with-data-10-year-range'
    }
  },
  build: {
    // Generate source maps so PostHog Error Tracking can symbolicate
    // stack traces. The Dockerfile runs `posthog-cli sourcemap upload`
    // post-build, then deletes the .map files before the runtime image
    // is assembled so they never ship publicly.
    sourcemap: true
  }
});