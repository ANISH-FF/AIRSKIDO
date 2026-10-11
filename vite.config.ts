import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  server: {
    port: 3000,
    host: true, // Listen on all local IPs so user can test on phone!
    allowedHosts: true, // Allow Cloudflare Tunnel hostnames!
    open: false,
    watch: {
      ignored: ['**/dist/**', '**/public/**']
    }
  },
  preview: {
    port: 3000,
    host: true,
    allowedHosts: true,
    open: false,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: 'index.html',
        privacy: 'privacy.html',
        terms: 'terms.html',
        about: 'about.html'
      }
    }
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  }
});
