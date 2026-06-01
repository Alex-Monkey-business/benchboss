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
const { isLoggedIn, isParent } = useAuth()
const { toasts } = useToast()

// Foreldre har en enkel selvstendig cup-side – ingen bunnmeny.
const showNav = computed(() => isLoggedIn.value && !isParent.value && route.name !== 'login')
const showDemo = computed(() => !isSupabaseConfigured)

// Splash plays as an overlay on cold load — destination route er allerede
// mounted under, så fade-out viser den uten router-thrash.
//
// Visnings-policy:
//   1. Maks én gang per uke (7-dagers rolling fra siste visning)
//   2. Aldri to ganger i samme browser-session (refresh / back-nav)
//   3. Bump SPLASH_VERSION når selve splashen endres for å tvinge replay
const SPLASH_VERSION = 1
const SPLASH_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const SESSION_KEY = 'splashShownInSession'
const LAST_KEY = 'splashLastShown'
const VERSION_KEY = 'splashVersion'

function shouldShowSplash() {
  if (sessionStorage.getItem(SESSION_KEY)) return false

  const savedVersion = Number(localStorage.getItem(VERSION_KEY))
  const last = Number(localStorage.getItem(LAST_KEY))
  const withinCooldown = savedVersion === SPLASH_VERSION
    && last
    && Date.now() - last < SPLASH_COOLDOWN_MS

  if (withinCooldown) {
    sessionStorage.setItem(SESSION_KEY, '1')
    return false
  }

  localStorage.setItem(LAST_KEY, String(Date.now()))
  localStorage.setItem(VERSION_KEY, String(SPLASH_VERSION))
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
