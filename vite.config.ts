import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      // Enable React compiler optimizations
      babel: {
        plugins: [
          ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }]
        ]
      }
    }),
    // Bundle analyzer (only in build mode with ANALYZE=true)
    process.env.ANALYZE && visualizer({
      filename: 'dist/bundle-analyzer.html',
      open: true,
      gzipSize: true,
      brotliSize: true
    })
  ].filter(Boolean),
  root: '.',
  build: {
    outDir: 'dist',
    sourcemap: false, // Disable sourcemaps in production
    minify: 'esbuild', // Use esbuild for faster minification
    target: 'es2020', // Modern target for smaller bundles
    chunkSizeWarningLimit: 600, // Warn for chunks > 600KB
    rollupOptions: {
      output: {
        // Advanced code splitting optimization
        manualChunks: (id) => {
          // Vendor libraries
          if (id.includes('node_modules')) {
            // React ecosystem
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            // Socket.IO
            if (id.includes('socket.io')) {
              return 'socket-vendor';
            }
            // Icons
            if (id.includes('lucide-react')) {
              return 'icons-vendor';
            }
            // Other vendor libraries
            return 'vendor';
          }
          
          // Application code splitting
          if (id.includes('components/')) {
            return 'components';
          }
          if (id.includes('hooks/')) {
            return 'hooks';
          }
          if (id.includes('utils/')) {
            return 'utils';
          }
        },
        // Optimize chunk names for caching
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId
            ? chunkInfo.facadeModuleId.split('/').pop()?.replace(/\.\w+$/, '')
            : 'chunk';
          return `assets/js/${facadeModuleId}-[hash].js`;
        },
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.') ?? [];
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash].[ext]`;
          }
          if (/css/i.test(ext)) {
            return `assets/css/[name]-[hash].[ext]`;
          }
          return `assets/[ext]/[name]-[hash].[ext]`;
        }
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