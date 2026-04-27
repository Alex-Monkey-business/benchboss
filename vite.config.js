import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const BUILD_VERSION = String(Date.now())

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'emit-version-json',
      apply: 'build',
      closeBundle() {
        const dir = resolve('dist')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(resolve(dir, 'version.json'), JSON.stringify({ version: BUILD_VERSION }))
      }
    }
  ],
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION)
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5174,
    strictPort: false
  }
})
