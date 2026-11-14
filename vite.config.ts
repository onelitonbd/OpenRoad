import { defineConfig } from 'vite';

// Vercel-friendly static build. The whole game is a static bundle, so the
// output directory is simply `dist` and there is no server side code.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // Keep the engine in its own chunk so the loading screen can show
        // progress while the big Three.js download is still running.
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('@dimforge/rapier3d-compat')) return 'rapier';
          return undefined;
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    // The live preview is proxied through a different host name, so the
    // server has to accept it as well.
    allowedHosts: true,
  },
});
