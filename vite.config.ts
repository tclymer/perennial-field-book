/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { CACHEABLE_TILE_RE, TILE_CACHE_NAME } from './src/map/cacheable.ts'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(
      `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Perennial Field Book',
        short_name: 'Field Book',
        description:
          'Map your orchard, find every tree, keep its history. Your data stays in your browser.',
        theme_color: '#4d7c0f',
        background_color: '#fafaf9',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Cache the app shell and its chunks so it opens without a connection.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,json,pbf}'],
        navigateFallback: 'index.html',
        // The API and the sign-in redirects are real server routes, never the app shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/(privacy|terms)\.html$/],
        // Public imagery may be kept for the field map without signal. Google tiles never
        // match this pattern (DESIGN.md §8.1).
        runtimeCaching: [
          {
            urlPattern: CACHEABLE_TILE_RE,
            handler: 'CacheFirst',
            options: {
              cacheName: TILE_CACHE_NAME,
              expiration: { maxEntries: 20000, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // MapLibre loads its worker as a module worker; build it as one.
  worker: { format: 'es' },
  // The API runs separately in development (`npm run api`, wrangler on port 8788).
  server: { proxy: { '/api': 'http://localhost:8788' } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The PWA register module exists only inside a Vite build; tests get a stub.
      ...(process.env.VITEST
        ? {
            'virtual:pwa-register/react': fileURLToPath(
              new URL('./tests/stubs/pwa-register.ts', import.meta.url),
            ),
          }
        : {}),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts'],
  },
})
