<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './stores/auth'
import { useToast } from './composables/useToast'
import { isSupabaseConfigured } from './supabase'
import { navHidden, hjemKlar } from './lib/shell'
import BottomNav from './components/BottomNav.vue'
import ToastNotification from './components/ToastNotification.vue'
import IosInstallBanner from './components/IosInstallBanner.vue'

const route = useRoute()
const router = useRouter()
const { isLoggedIn, ready } = useAuth()
const { toasts } = useToast()

// Fanene i bunnmenyen er hver sin fil og lastes først når du trykker. Det
// er 100–300 ms med tom flate på første trykk på hver fane, over mobilnett.
// Etter at første skjerm står, hentes de i bakgrunnen mens appen har ro.
//
// Bare de tre fanene folk faktisk trykker på — ikke alle åtte rutene med
// avhengigheter (~45 filer). Og ikke før Hjem har fått dataene sine: lastet
// samtidig, sto Hjem og ventet på sine egne filer bak andres.
const FANER = ['kamper', 'trening', 'statistikk']
function lastRuter(navn) {
  for (const r of router.getRoutes()) {
    if (!navn.includes(r.name)) continue
    const c = r.components?.default
    if (typeof c === 'function') { try { c() } catch { /* ok */ } }
  }
}
let forhandslastet = false
let faneneStartet = null
const faneneLastet = new Promise(r => { faneneStartet = r })
function forhandslastFaner() {
  if (forhandslastet) return
  forhandslastet = true
  const start = () => lastRuter(FANER)
  const vent = ms => new Promise(r => setTimeout(r, ms))
  const lastet = new Promise(r => {
    if (document.readyState === 'complete') r()
    else window.addEventListener('load', r, { once: true })
  })
  // Hjem: når første henting er ferdig (eller senest 5 s etter last, om nettet
  // står). Andre skjermer: 1,5 s etter last.
  router.isReady().then(() => route.name === 'hjem'
    ? Promise.race([hjemKlar, lastet.then(() => vent(5000))])
    : lastet.then(() => vent(1500))
  ).then(() => {
    const kjor = () => { start(); faneneStartet() }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(kjor, { timeout: 3000 })
    else setTimeout(kjor, 200)
  })
}

// Naboene: skjermene du mest sannsynlig trykker deg videre til herfra. Lastes
// når du står på en fane og appen har ro, så neste trykk ikke venter på nett.
const NABOER = { hjem: ['del-inn', 'okt', 'match'], kamper: ['match'], trening: ['trening-dag', 'okt', 'del-inn'] }
const naboerLastet = new Set()
watch(() => route.name, navn => {
  const naboer = (NABOER[navn] || []).filter(n => !naboerLastet.has(n))
  if (!naboer.length) return
  naboer.forEach(n => naboerLastet.add(n))
  const start = () => lastRuter(naboer)
  // Først etter fanene: på kald start skal ingenting slåss med Hjem.
  faneneLastet.then(() => setTimeout(() => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 3000 })
    else start()
  }, 1000))
})

watch([ready, isLoggedIn], ([r, inn]) => {
  if (r && inn) forhandslastFaner()
  // Routeren slapp deg inn på cachen, men bootstrap fant ingen sesjon.
  if (r && !inn && route.name && !route.meta?.public) router.replace({ name: 'login', query: { redirect: route.fullPath } })
}, { immediate: true })

// 'kom-i-gang' er fullskjerm: en bunnmeny til fire tomme faner er ikke en
// utvei, den er støy.
const AUTH_ROUTES = ['login', 'auth-callback', 'kom-i-gang']

// Både trenere og foreldre får navigasjonen (BottomNav viser rollebaserte faner).
const showNav = computed(() => isLoggedIn.value && !AUTH_ROUTES.includes(route.name) && !navHidden.value)
const showDemo = computed(() => !isSupabaseConfigured)
</script>

<template>
  <!-- Tom flate på samme bakgrunn til sesjonen er lest. Uten den ser man et
       glimt av innloggingsskjermen ved hver kalde start, selv når man er
       innlogget. Varm start løses av localStorage-speilingen i storen, så
       dette varer sjelden mer enn et bilde. -->
  <div v-if="!ready" class="app-boot"></div>

  <div v-else class="app-layout">
    <div v-if="showDemo" class="demo-banner">
      Demo-modus &mdash; koble til Supabase for ekte data
    </div>
    <BottomNav v-if="showNav" />
    <main class="app-main">
      <!-- Ingen overgang mellom skjermer: med «out-in» ventet hvert trykk
           på at den gamle siden tonet ut før den nye i det hele tatt ble
           laget. En fane skal bytte i samme bilde, som i en app. -->
      <router-view />
    </main>
    <ToastNotification :toasts="toasts" />
    <IosInstallBanner :above-nav="showNav" />
  </div>
</template>

<style scoped>
.app-boot {
  min-height: 100dvh;
  background: var(--ds-color-bg);
}
</style>
