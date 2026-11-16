import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { startVersionCheck } from './composables/useVersionCheck'
import { startErrorReporting } from './lib/errorReporter'
import { startSporing } from './lib/sporing'
// Side-effect import: applies stored theme to <html> before first paint
import './composables/useTheme'
import './composables/useDesign'
// Side-effect import: registers PWA install listeners at boot (catches early beforeinstallprompt)
import './composables/usePwaInstall'
import '../design-system/index.css'
import './assets/app.css'

startVersionCheck(router)

// Etter en deploy finnes ikke de gamle chunkene lenger, og en lazy-lastet
// skjerm feiler med en gang. Last siden på nytt én gang så den nye versjonen
// hentes. Flagget i sessionStorage hindrer en evig løkke om noe annet er galt.
window.addEventListener('vite:preloadError', event => {
  const KEY = 'bb_preload_reload'
  try {
    const sist = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - sist < 60_000) return
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

// Register the network-only service worker so the app is installable (Android).
// It caches nothing — see public/pwa-sw.js.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/pwa-sw.js').catch(() => {})
  })
}

const app = createApp(App)
startErrorReporting(app)
// Sidevisninger til den felles telemetri-tabellen. `feil: false` fordi
// BenchBoss melder krasj til sin egen client_errors — se lib/errorReporter.js.
startSporing({ prosjekt: 'benchboss', feil: false })
app.use(router).mount('#app')
