<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from './stores/auth'
import { useToast } from './composables/useToast'
import { isSupabaseConfigured } from './supabase'
import BottomNav from './components/BottomNav.vue'
import ToastNotification from './components/ToastNotification.vue'

const route = useRoute()
const { isLoggedIn } = useAuth()
const { toasts } = useToast()

const showNav = computed(() => isLoggedIn.value && route.name !== 'login' && route.name !== 'splash')
const showDemo = computed(() => !isSupabaseConfigured && route.name !== 'splash')
</script>

<template>
  <div class="app-layout">
    <div v-if="showDemo" class="demo-banner">
      Demo-modus &mdash; koble til Supabase for ekte data
    </div>
    <!-- Nav renders before main so sticky top works on desktop -->
    <BottomNav v-if="showNav" />
    <main class="app-main">
      <router-view v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </router-view>
    </main>
    <ToastNotification :toasts="toasts" />
  </div>
</template>
