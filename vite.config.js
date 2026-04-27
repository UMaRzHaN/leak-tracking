import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
