import { ref, computed } from 'vue'

// Module-level state — listeners register once at import time (from main.js),
// so we don't miss the beforeinstallprompt event that fires early at boot.
const deferredPrompt = ref(null)
const isInstalled = ref(false)

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true

const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent)

isInstalled.value = isStandalone()

// Chrome/Android: stash the event so a button can trigger the native prompt later.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt.value = e
})

window.addEventListener('appinstalled', () => {
  deferredPrompt.value = null
  isInstalled.value = true
})

export function usePwaInstall() {
  // Native one-tap prompt is available (Android/Chrome/Edge).
  const canPromptInstall = computed(() => !!deferredPrompt.value && !isInstalled.value)

  // iOS has no install API — the user must use Share → Add to Home Screen.
  const needsManualInstall = computed(() => isIOS && !isInstalled.value)

  async function promptInstall() {
    if (!deferredPrompt.value) return null
    deferredPrompt.value.prompt()
    const { outcome } = await deferredPrompt.value.userChoice
    deferredPrompt.value = null
    return outcome // 'accepted' | 'dismissed'
  }

  return { isInstalled, isIOS, canPromptInstall, needsManualInstall, promptInstall }
}
