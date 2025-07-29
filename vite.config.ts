import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    sourcemap: false, // Disable sourcemaps in production
    minify: 'esbuild', // Use esbuild for faster minification
    target: 'es2020', // Modern target for smaller bundles
    chunkSizeWarningLimit: 600, // Warn for chunks > 600KB
    rollupOptions: {
      output: {
        // Code splitting optimization
        manualChunks: {
          vendor: ['react', 'react-dom'],
          socket: ['socket.io-client'],
          icons: ['lucide-react']
        },
        // Optimize chunk names
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
      }
    },
    // Build optimization
    reportCompressedSize: false, // Faster builds
    cssCodeSplit: true, // Split CSS per component
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'socket.io-client', 'lucide-react'],
    exclude: ['@vite/client', '@vite/env']
  },
  server: {
    port: 3000,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})