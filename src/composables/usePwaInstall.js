import { ref, computed } from 'vue'

// Module-level state — listeners register once at import time (from main.js),
// so we don't miss the beforeinstallprompt event that fires early at boot.
const deferredPrompt = ref(null)
const isInstalled = ref(false)

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true

const ua = window.navigator.userAgent
// iPadOS 13+ reports a Mac UA — fall back to touch-point sniffing.
const isIpadOS = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1
const isIOS = /iphone|ipad|ipod/i.test(ua) || isIpadOS

// Which iOS browser — decides WHERE the "Add to Home Screen" action lives,
// and whether it's reachable at all (in-app webviews can't add).
function detectIosBrowser() {
  if (!isIOS) return null
  if (/CriOS/i.test(ua)) return 'chrome'
  if (/EdgiOS/i.test(ua)) return 'edge'
  if (/FxiOS/i.test(ua)) return 'firefox'
  // Known in-app browsers (Facebook, Instagram, etc.) — Add to Home Screen unavailable.
  if (/FBAN|FBAV|Instagram|Line|MicroMessenger|Snapchat|Twitter/i.test(ua)) return 'webview'
  if (/Safari/i.test(ua) && /Version\//i.test(ua)) return 'safari'
  // WKWebView without a Safari token → treat as in-app.
  return 'webview'
}
const iosBrowser = detectIosBrowser()

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

  return { isInstalled, isIOS, iosBrowser, canPromptInstall, needsManualInstall, promptInstall }
}
