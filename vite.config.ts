/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: 'Dragonbane Character Manager',
        short_name: 'Dragonbane',
        description: 'A web application to manage characters, parties, and game data for the Dragonbane TTRPG.',
        theme_color: '#2c3e50',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-72x72.png',
            sizes: '72x72',
            type: 'image/png',
          },
          {
            src: '/icons/icon-96x96.png',
            sizes: '96x96',
            type: 'image/png',
          },
          {
            src: '/icons/icon-128x128.png',
            sizes: '128x128',
            type: 'image/png',
          },
          {
            src: '/icons/icon-144x144.png',
            sizes: '144x144',
            type: 'image/png',
          },
          {
            src: '/icons/icon-152x152.png',
            sizes: '152x152',
            type: 'image/png',
          },
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-384x384.png',
            sizes: '384x384',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // --- FIX 1: Increase the cache limit to 5MB (Default is 2MB) ---
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],

  server: {
    cors: {
      origin: '*', 
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-client-info', 'apikey'],
      credentials: true,
    },
  },

  optimizeDeps: {
    exclude: ['lucide-react'],
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },

  define: {
    'import.meta.env.PROD': JSON.stringify(process.env.NODE_ENV === 'production'),
    'import.meta.env.DEV': JSON.stringify(process.env.NODE_ENV !== 'production'),
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    // Increase warning limit to avoid console noise
    chunkSizeWarningLimit: 1600,
    
    // --- FIX 2: Code Splitting (Manual Chunks) ---
    // This breaks the large file into smaller pieces
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Keep Supabase separate
            if (id.includes('@supabase')) {
              return 'supabase';
            }
            // Keep Markdown libraries separate (they are large)
            if (id.includes('react-markdown') || id.includes('rehype') || id.includes('remark') || id.includes('micromark')) {
              return 'markdown';
            }
            // Keep Editor libraries separate
            if (id.includes('@uiw')) {
              return 'editor';
            }
            // Everything else goes into vendor
            return 'vendor';
          }
        },
      },
    },
  },
});