import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import eslint from 'vite-plugin-eslint';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(),eslint()],
  build: {
    // Generate source maps so PostHog Error Tracking can symbolicate
    // stack traces. The Dockerfile runs `posthog-cli sourcemap upload`
    // post-build, then deletes the .map files before the runtime image
    // is assembled so they never ship publicly.
    sourcemap: true
  }
});