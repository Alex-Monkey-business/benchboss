<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from './stores/auth'
import { useToast } from './composables/useToast'
import { isSupabaseConfigured } from './supabase'
import BottomNav from './components/BottomNav.vue'
import ToastNotification from './components/ToastNotification.vue'
import IosInstallBanner from './components/IosInstallBanner.vue'

const route = useRoute()
const { isLoggedIn, ready } = useAuth()
const { toasts } = useToast()

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
