import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const BUILD_VERSION = String(Date.now())

// Nødbryter for overgangen fra PIN til Supabase Auth. Emittes til
// version.json, som ligger som en vanlig fil på Netlify — så den kan settes
// til false i Netlify-UI-et uten en deploy, og virker innen 60 sekunder.
// En ny deploy setter den tilbake til verdien her.
//
// STENGT 2026-08-13. Alex, Iver, Simon og Susanne er inne med e-post. Jacob og
// Trond gikk fortsatt på broen — den eneste grunnen til at `anon` beholdt skrive-
// tilgang. Skal den åpnes igjen: sett true her og deploy, eller rediger
// version.json i Netlify-UI-et for å komme unna byggekøen.
const LEGACY_AUTH = false

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'emit-version-json',
      apply: 'build',
      closeBundle() {
        const dir = resolve('dist')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(resolve(dir, 'version.json'), JSON.stringify({ version: BUILD_VERSION, legacyAuth: LEGACY_AUTH }))
      }
    }
  ],
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
    __LEGACY_AUTH__: JSON.stringify(LEGACY_AUTH)
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5174,
    strictPort: false
  }
})
