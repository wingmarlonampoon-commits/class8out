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
        const distIndex = resolve(__dirname, 'dist/index.html')
        const dist404 = resolve(__dirname, 'dist/404.html')

        if (existsSync(distIndex)) {
          copyFileSync(distIndex, dist404)
        }
      },
    },
  ],
  base: '/class8out/',
})