import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, existsSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),

    {
      name: 'github-pages-spa-fallback',

      closeBundle() {
        const indexFile = resolve(__dirname, 'dist/index.html')
        const fallbackFile = resolve(__dirname, 'dist/404.html')

        if (existsSync(indexFile)) {
          copyFileSync(indexFile, fallbackFile)
        }
      },
    },
  ],

  base: '/class8out/',
})