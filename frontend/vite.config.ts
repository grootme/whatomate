import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import compression from 'vite-plugin-compression'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    // Gzip compression
    compression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024 // Only compress files > 1KB
    }),
    // Brotli compression (better ratio)
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core Vue ecosystem
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          // UI primitives
          'reka-ui': ['reka-ui'],
          // Charts (heavy)
          'charts': ['chart.js', 'vue-chartjs'],
          // Grid layout (heavy)
          'grid-layout': ['grid-layout-plus'],
          // Emoji picker (heavy)
          'emoji-picker': ['vue3-emoji-picker'],
          // Form validation
          'validation': ['vee-validate', '@vee-validate/zod', 'zod'],
          // Utilities
          'utils': ['@vueuse/core', 'axios', 'clsx', 'tailwind-merge', 'class-variance-authority']
        }
      }
    },
    // Increase chunk size warning limit (optional)
    chunkSizeWarningLimit: 500
  },
  // Drop console and debugger in production builds
  esbuild: {
    drop: ['console', 'debugger']
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    allowedHosts: 'all',
    proxy: {
      // Whatomate Go Backend
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true
      },
      // Hermes Agent API Server (port 8642) — OpenAI-compatible
      '/hermes-api': {
        target: 'http://localhost:8642',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hermes-api/, ''),
      },
      // Hermes WhatsApp Baileys Bridge (port 3001)
      '/hermes-bridge': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hermes-bridge/, ''),
      },
      // Hermes Dashboard API (port 9119)
      '/hermes-dashboard': {
        target: 'http://localhost:9119',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hermes-dashboard/, ''),
      },
      // DeerFlow Gateway (port 8001)
      '/deerflow-api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/deerflow-api/, ''),
      },
      // Cognitive Capital API (port 8645)
      '/cognitive-api': {
        target: 'http://localhost:8645',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cognitive-api/, ''),
      },
      // Real-Time Bundle — Monitoreo/Análisis/Decisión (port 8650)
      '/bundle-api': {
        target: 'http://localhost:8650',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bundle-api/, ''),
      },
      // Shadowbroker AI Bridge — OSINT Intelligence (port 8660)
      '/sb-api': {
        target: 'http://localhost:8660',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sb-api/, ''),
      },
    }
  }
})
