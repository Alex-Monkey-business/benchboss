import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { startVersionCheck } from './composables/useVersionCheck'
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

createApp(App).use(router).mount('#app')

// Fade out the launch splash once the app is mounted (standalone launches only).
// Hold briefly so the icon's pop animation reads, then cross-fade to the app.
const splash = document.getElementById('app-splash')
if (splash) {
  setTimeout(() => {
    splash.classList.add('is-hiding')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
  }, 600)
}
