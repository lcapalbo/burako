import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/burako/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'script',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Burako',
        short_name: 'Burako',
        description: 'Burako para jugar en casa, contra la computadora.',
        theme_color: '#f2f4ed',
        background_color: '#f2f4ed',
        display: 'standalone',
        start_url: '/burako/',
        scope: '/burako/',
        lang: 'es',
        icons: [
          {
            src: 'icons/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/burako\/$/],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
  },
}));