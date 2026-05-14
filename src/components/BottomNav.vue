<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'

const route = useRoute()
const { coach } = useAuth()
const { matches, getCoachesForMatch } = useMatches()
const { getExpenseForMatch } = useExpenses()

const tabs = [
  { name: 'matches', label: 'Kamper', path: '/' },
  { name: 'stats', label: 'Statistikk', path: '/statistikk' },
  { name: 'admin', label: 'Admin', path: '/admin' }
]

function isActive(tab) {
  if (tab.name === 'matches') return route.path === '/' || route.path.startsWith('/kamp')
  if (tab.name === 'admin') return route.path === '/admin' || route.path.startsWith('/admin/')
  if (tab.name === 'stats') return route.path === '/statistikk'
  return route.path === tab.path
}

// Pending = past HOME matches where I'm assigned as coach AND no expense logged.
// Away matches don't have utlegg, so they never count.
const pendingCount = computed(() => {
  if (!coach.value || !matches.value?.length) return 0
  const today = new Date().toISOString().slice(0, 10)
  return matches.value.filter(m =>
    (m.home_team || '').toLowerCase().includes('halsen') &&
    m.match_date < today &&
    !getExpenseForMatch(m.id) &&
    getCoachesForMatch(m.id).includes(coach.value.id)
  ).length
})
</script>

<template>
  <nav class="bottom-nav">
    <router-link
      v-for="tab in tabs"
      :key="tab.name"
      :to="tab.path"
      :class="['bottom-nav__item', { 'bottom-nav__item--active': isActive(tab) }]"
    >
      <!-- Kamper -->
      <span v-if="tab.name === 'matches'" class="bottom-nav__icon-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span v-if="pendingCount > 0" class="bottom-nav__badge" aria-label="venter på handling"></span>
      </span>
      <!-- Statistikk -->
      <svg v-if="tab.name === 'stats'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <line x1="6" y1="20" x2="6" y2="13"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="18" y1="20" x2="18" y2="9"/>
        <line x1="3" y1="20" x2="21" y2="20"/>
      </svg>
      <!-- Admin -->
      <svg v-if="tab.name === 'admin'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
      <span>{{ tab.label }}</span>
    </router-link>
  </nav>
</template>
