/**
 * Vite configuration for the browser client.
 *
 * The page talks to the WebSocket gateway through a **relative** URL (`/ws`) so the same build works
 * behind any host/proxy (including the Arena live-preview proxy); the dev server forwards `/ws` to the
 * gateway on the loopback interface, which is why the browser never needs to know a localhost address.
 */

import { defineConfig } from 'vite';

const gatewayPort = Number(process.env.MU_REENGINEER_GATEWAY_PORT ?? 7788);

export default defineConfig({
  root: '.',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    proxy: {
      '/ws': {
        target: `ws://127.0.0.1:${gatewayPort}`,
        ws: true,
        changeOrigin: true,
      },
      // real game data (when the gateway was started with --data-dir / MU_REENGINEER_DATA)
      '/assets': {
        target: `http://127.0.0.1:${gatewayPort}`,
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:7788',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist-browser',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
});
