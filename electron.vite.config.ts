import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], resolve: { alias: shared } },
  preload: { plugins: [externalizeDepsPlugin()], resolve: { alias: shared } },
  renderer: {
    resolve: { alias: shared },
    define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.1.0') },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          pet: resolve('src/renderer/pet.html'),
          dashboard: resolve('src/renderer/dashboard.html')
        }
      }
    }
  }
})
