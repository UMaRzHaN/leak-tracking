import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
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
          // exceljs & jszip removed - now loaded via dynamic import() on-demand
          // they will code-split automatically when imported dynamically
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'src/reportWebVitals.js',
        'src/index.jsx',
        'src/app/migrations/**',
        'scripts/**',
        'android/**',
      ],
    },
  },
});
