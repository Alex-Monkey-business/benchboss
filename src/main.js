import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { startVersionCheck } from './composables/useVersionCheck'
import { startErrorReporting } from './lib/errorReporter'
import { startSporing } from './lib/sporing'
// Side-effect import: applies stored theme to <html> before first paint
import './composables/useTheme'
// Side-effect import: registers PWA install listeners at boot (catches early beforeinstallprompt)
import './composables/usePwaInstall'
import '../design-system/index.css'
import './assets/app.css'

startVersionCheck()

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
