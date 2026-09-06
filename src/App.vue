<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './stores/auth'
import { useToast } from './composables/useToast'
import { isSupabaseConfigured } from './supabase'
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
const FANER = ['kamper', 'trening', 'statistikk', 'admin', 'cup', 'serie', 'serie-tropp', 'match']
function forhandslastFaner() {
  const start = () => {
    for (const r of router.getRoutes()) {
      if (!FANER.includes(r.name)) continue
      const c = r.components?.default
      if (typeof c === 'function') { try { c() } catch { /* ok */ } }
    }
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 3000 })
  else setTimeout(start, 1200)
}

watch([ready, isLoggedIn], ([r, inn]) => {
  if (r && inn) forhandslastFaner()
  // Routeren slapp deg inn på cachen, men bootstrap fant ingen sesjon.
  if (r && !inn && route.name && !route.meta?.public) router.replace({ name: 'login', query: { redirect: route.fullPath } })
}, { immediate: true })

// 'kom-i-gang' er fullskjerm: en bunnmeny til fire tomme faner er ikke en
// utvei, den er støy.
const AUTH_ROUTES = ['login', 'auth-callback', 'kom-i-gang']

// Både trenere og foreldre får navigasjonen (BottomNav viser rollebaserte faner).
const showNav = computed(() => isLoggedIn.value && !AUTH_ROUTES.includes(route.name))
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
      <router-view v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </router-view>
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
