import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/gateway': {
        target: 'http://localhost:4001',
        rewrite: (path) => path.replace(/^\/api\/gateway/, '/api'),
      },
      '/api/cloud': {
        target: 'http://localhost:4000',
        rewrite: (path) => path.replace(/^\/api\/cloud/, '/api'),
      },
    },
  },
});
