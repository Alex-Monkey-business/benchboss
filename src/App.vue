<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from './stores/auth'
import { useToast } from './composables/useToast'
import { isSupabaseConfigured } from './supabase'
import BottomNav from './components/BottomNav.vue'
import SplashOverlay from './components/SplashOverlay.vue'
import ToastNotification from './components/ToastNotification.vue'

const route = useRoute()
const { isLoggedIn } = useAuth()
const { toasts } = useToast()

const showNav = computed(() => isLoggedIn.value && route.name !== 'login')
const showDemo = computed(() => !isSupabaseConfigured)

// Splash plays as an overlay on cold load — destination route er allerede
// mounted under, så fade-out viser den uten router-thrash.
//
// Visnings-policy (best practice for en daglig-bruk coach-app):
//   1. Maks én gang per dag (date-stamp i localStorage)
//   2. Aldri to ganger i samme browser-session (refresh / back-nav)
//   3. Bump SPLASH_VERSION når selve splashen endres for å tvinge replay
const SPLASH_VERSION = 1
const SESSION_KEY = 'splashShownInSession'
const LAST_KEY = 'splashLastShown'

function todayKey() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}-v${SPLASH_VERSION}`
}

function shouldShowSplash() {
  if (sessionStorage.getItem(SESSION_KEY)) return false
  if (localStorage.getItem(LAST_KEY) === todayKey()) {
    sessionStorage.setItem(SESSION_KEY, '1')
    return false
  }
  localStorage.setItem(LAST_KEY, todayKey())
  sessionStorage.setItem(SESSION_KEY, '1')
  return true
}

const showSplash = ref(shouldShowSplash())

function handleSplashDone() {
  showSplash.value = false
}
</script>

<template>
  <div class="app-layout">
    <div v-if="showDemo && !showSplash" class="demo-banner">
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
    <SplashOverlay v-if="showSplash" @done="handleSplashDone" />
  </div>
</template>
