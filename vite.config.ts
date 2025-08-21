/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    // --- PRODUCTION WARNING ---
    // The current CORS policy allows all origins ('*').
    // This is suitable for isolated development environments like WebContainer.
    // HOWEVER, FOR ACTUAL PRODUCTION DEPLOYMENT, YOU **MUST** RESTRICT THIS.
    // Replace '*' with the specific URL(s) of your frontend application.
    // Failure to do so will create a security risk.
    // Example for production:
    // cors: {
    //   origin: ['https://your-app-domain.com', 'https://www.your-app-domain.com'],
    //   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    //   allowedHeaders: ['Content-Type', 'Authorization', 'x-client-info', 'apikey'],
    //   credentials: true,
    // },
    // --- END PRODUCTION WARNING ---
    cors: {
      origin: '*', // DEVELOPMENT ONLY - CHANGE FOR PRODUCTION!
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
    setupFiles: './src/setupTests.ts', // Optional: if you need setup files
    // You might want to exclude certain files/folders
    // exclude: [...configDefaults.exclude, '**/node_modules/**'],
  },

  // Define environment variables for production check
  define: {
    'import.meta.env.PROD': JSON.stringify(process.env.NODE_ENV === 'production'),
    'import.meta.env.DEV': JSON.stringify(process.env.NODE_ENV !== 'production'),
  },

  // Production build configuration
  build: {
    outDir: 'dist', // Output directory for build files
    sourcemap: false, // Disable sourcemaps for production for smaller bundle size & obscurity
    // Consider adding chunk splitting or other optimizations if needed
  },
});
