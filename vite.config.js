import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  // Relative asset URLs so the build works from file:// and from any subpath a
  // games portal happens to host it under.
  base: './',
  // Bind IPv4 explicitly: the default `localhost` binds ::1 only on macOS,
  // which the capture harness (127.0.0.1) cannot reach.
  // `hmr: false` when the capture harness owns the server (OW_NO_HMR=1): a file
  // saved by a concurrently-working agent otherwise reloads the page mid-capture
  // and playwright fails with "Execution context was destroyed".
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    hmr: process.env.OW_NO_HMR ? false : undefined,
  },
  preview: { host: '127.0.0.1' },
  // VITE_SOURCEMAP=0 for portal builds: the map is larger than the game itself
  // and neither Yandex nor CrazyGames serves it.
  build: {
    target: 'es2022',
    sourcemap: process.env.VITE_SOURCEMAP === '1',
    chunkSizeWarningLimit: 4096,
  },
  // Large binary game assets served verbatim.
  assetsInclude: ['**/*.ktx2', '**/*.hdr', '**/*.exr', '**/*.bin', '**/*.glb'],
});
