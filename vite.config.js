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

// Hjem er skjermen nesten alle åpner appen på, men den er en egen fil som
// routeren først ber om når hovedfila er lastet og kjørt: én rundtur til før
// noe vises. Står adressen på «/», legger et lite skript i <head> inn
// modulepreload for Hjem-fila og det den trenger, så de lastes ned SAMTIDIG
// med hovedfila. Andre adresser (cup for foreldre, lenker) betaler ingenting.
function forhandslastHjem() {
  return {
    name: 'forhandslast-hjem',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle
        if (!bundle) return
        const chunks = Object.values(bundle).filter(c => c.type === 'chunk')
        const entry = chunks.find(c => c.isEntry)
        const hjem = chunks.find(c => c.facadeModuleId?.endsWith('/src/views/HjemView.vue'))
        if (!entry || !hjem) return
        const js = new Set()
        const css = new Set()
        const samle = f => {
          if (js.has(f) || f === entry.fileName) return
          const c = bundle[f]
          if (!c) return
          js.add(f)
          c.imports.forEach(samle)
          c.viteMetadata?.importedCss?.forEach(x => css.add(x))
        }
        samle(hjem.fileName)
        const filer = [...js].filter(f => !entry.imports.includes(f))
        const kode = `if(location.pathname==='/'){var h=document.head;${JSON.stringify(filer)}.forEach(function(f){var l=document.createElement('link');l.rel='modulepreload';l.href='/'+f;h.appendChild(l)});${JSON.stringify([...css])}.forEach(function(f){var l=document.createElement('link');l.rel='preload';l.as='style';l.crossOrigin='';l.href='/'+f;h.appendChild(l)})}`
        return [{ tag: 'script', children: kode, injectTo: 'head' }]
      }
    }
  }
}

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
    },
    forhandslastHjem()
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
