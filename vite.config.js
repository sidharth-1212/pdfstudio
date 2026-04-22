import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Include the worker file so the engine runs offline
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pdf.worker.mjs'],
      manifest: {
        name: 'PDF Studio',
        short_name: 'PDF Studio',
        description: 'Local-first, high-performance PDF utility engine.',
        theme_color: '#09090b', // zinc-950 to match your UI
        background_color: '#09090b',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Crucial for your app: allows caching of the heavy pdfjs worker
        maximumFileSizeToCacheInBytes: 5000000 
      }
    })
  ],
})