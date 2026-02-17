/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';

// --- ROBUST VERSION CALCULATION ---
const getAppVersion = () => {
  try {
    const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
    const baseVersion = pkg.version;
    const commitHash = process.env.COMMIT_REF 
      ? process.env.COMMIT_REF.substring(0, 7) 
      : 'dev';
    const versionString = `${baseVersion}-${commitHash}`;
    console.log(`✅ BUILDING VERSION: ${versionString}`);
    return versionString;
  } catch (e) {
    console.error("⚠️ Failed to read version", e);
    return '0.0.0-error';
  }
};

const appVersion = getAppVersion();
const buildDate = new Date().toISOString();

const getNodeModulePackageName = (moduleId: string): string | null => {
  const normalizedPath = moduleId.replace(/\\/g, '/');
  const marker = '/node_modules/';
  const markerIndex = normalizedPath.lastIndexOf(marker);

  if (markerIndex === -1) return null;

  const packagePath = normalizedPath.slice(markerIndex + marker.length);
  const packageParts = packagePath.split('/');
  if (packageParts.length === 0) return null;

  if (packageParts[0].startsWith('@')) {
    return packageParts.length > 1 ? `${packageParts[0]}/${packageParts[1]}` : null;
  }

  return packageParts[0];
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      
      // --- FIX: Increase cache limit to 5MB ---
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        globIgnores: [
          'assets/pdf-*.js',
          'assets/CharacterSheetPdf-*.js',
        ],
      },

      devOptions: {
        enabled: true,
        type: 'module',
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
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_BUILD_DATE': JSON.stringify(buildDate),
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1600, // Suppress standard Vite warning
    
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          const packageName = getNodeModulePackageName(id);
          if (!packageName) return;

          if (packageName.startsWith('@supabase/')) return 'supabase';

          if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler') {
            return 'react-core';
          }

          if (
            packageName === '@react-pdf/renderer' ||
            packageName === '@react-pdf/font' ||
            packageName === '@react-pdf/layout' ||
            packageName === '@react-pdf/pdfkit' ||
            packageName === '@react-pdf/primitives' ||
            packageName === '@react-pdf/render' ||
            packageName === '@react-pdf/textkit'
          ) {
            return 'pdf';
          }

          if (packageName === 'lucide-react' || packageName === 'react-feather') {
            return 'icons';
          }
        },
      },
    },
  },
});
