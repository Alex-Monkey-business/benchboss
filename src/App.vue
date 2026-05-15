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

// Splash plays as an overlay on cold load — destination route is already
// mounted underneath, so the fade-out reveals it without a router thrash.
const SPLASH_COOLDOWN_MS = 30 * 60 * 1000

function shouldShowSplash() {
  const last = Number(localStorage.getItem('splashLastShown'))
  if (last && Date.now() - last < SPLASH_COOLDOWN_MS) return false
  localStorage.setItem('splashLastShown', String(Date.now()))
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
