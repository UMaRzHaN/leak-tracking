import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({ filename: 'dist/stats.html', open: false, gzipSize: true }),
  ],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-capacitor': [
            '@capacitor/core',
            '@capacitor/filesystem',
            '@capacitor/camera',
            '@capacitor/geolocation',
            '@capacitor/share',
            '@capacitor-community/speech-recognition',
          ],
          'vendor-zod': ['zod'],
          // exceljs & jszip removed - now loaded via dynamic import() on-demand
          // they will code-split automatically when imported dynamically
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
