<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useMatches } from '../composables/useMatches'
import { useExpenses } from '../composables/useExpenses'
import { localISODate } from '../lib/dateLabels'

const route = useRoute()
const router = useRouter()
const { coach, isParent, logout } = useAuth()
const { matches, getCoachesForMatch } = useMatches()
const { getExpenseForMatch } = useExpenses()

// Trenere får full meny; foreldre får read-only-sidene + logg ut.
// Samme komponent → bunnmeny på mobil, toppmeny på desktop (se app.css).
const COACH_TABS = [
  { name: 'hjem', label: 'Hjem', path: '/' },
  { name: 'matches', label: 'Kamper', path: '/kamper' },
  { name: 'trening', label: 'Trening', path: '/trening' },
  { name: 'stats', label: 'Statistikk', path: '/statistikk' },
  { name: 'admin', label: 'Admin', path: '/admin' }
]
const PARENT_TABS = [
  { name: 'serie', label: 'Kamper', path: '/serie' },
  { name: 'tropp', label: 'Tropp', path: '/serie/tropp' },
  { name: 'cup', label: 'Cup', path: '/cup' },
  { name: 'logout', label: 'Logg ut', action: 'logout' }
]
const tabs = computed(() => (isParent.value ? PARENT_TABS : COACH_TABS))

function isActive(tab) {
  if (tab.name === 'hjem') return route.path === '/'
  if (tab.name === 'matches') return route.path === '/kamper' || route.path.startsWith('/kamp/')
  if (tab.name === 'trening') return route.path.startsWith('/trening')
  if (tab.name === 'tropp') return route.path.startsWith('/serie/tropp')
  if (tab.name === 'serie') return route.path === '/serie'
  if (tab.name === 'admin') return route.path === '/admin' || route.path.startsWith('/admin/') || route.path.startsWith('/cup')
  if (tab.name === 'stats') return route.path === '/statistikk'
  if (tab.name === 'cup') return route.path.startsWith('/cup')
  return false
}

function onTabClick(tab) {
  if (tab.action === 'logout') {
    logout()
    router.push('/login')
  }
}

// Pending = past HOME matches where I'm assigned as coach AND no expense logged.
const pendingCount = computed(() => {
  if (!coach.value || !matches.value?.length) return 0
  const today = localISODate()
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
    <component
      :is="tab.action ? 'button' : 'router-link'"
      v-for="tab in tabs"
      :key="tab.name"
      :to="tab.action ? undefined : tab.path"
      :type="tab.action ? 'button' : undefined"
      :class="['bottom-nav__item', { 'bottom-nav__item--active': isActive(tab), 'bottom-nav__item--quiet': tab.action === 'logout' }]"
      @click="tab.action && onTabClick(tab)"
    >
      <!-- Hjem (hus) -->
      <span v-if="tab.name === 'hjem'" class="bottom-nav__icon-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 10.5 12 3l9 7.5"/>
          <path d="M5.5 9.5V21h13V9.5"/>
          <path d="M9.5 21v-6h5v6"/>
        </svg>
        <span v-if="pendingCount > 0" class="bottom-nav__badge" aria-label="venter på handling"></span>
      </span>
      <!-- Kamper (serie) -->
      <svg v-if="tab.name === 'matches' || tab.name === 'serie'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <!-- Tropp (drakt) -->
      <svg v-if="tab.name === 'tropp'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8.5 3 4 5.5 5.8 9l1.7-.8V21h9V8.2l1.7.8L20 5.5 15.5 3a3.5 3.5 0 0 1-7 0z"/>
      </svg>
      <!-- Trening (kjegle) -->
      <svg v-if="tab.name === 'trening'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9.8 4h4.4l3.6 13.5H6.2L9.8 4z"/>
        <line x1="8.3" y1="9.5" x2="15.7" y2="9.5"/>
        <line x1="3.5" y1="20.5" x2="20.5" y2="20.5"/>
      </svg>
      <!-- Statistikk -->
      <svg v-if="tab.name === 'stats'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <line x1="6" y1="20" x2="6" y2="13"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="18" y1="20" x2="18" y2="9"/>
        <line x1="3" y1="20" x2="21" y2="20"/>
      </svg>
      <!-- Cup (pokal) -->
      <svg v-if="tab.name === 'cup'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/>
        <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>
      </svg>
      <!-- Admin -->
      <svg v-if="tab.name === 'admin'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
      <!-- Logg ut -->
      <svg v-if="tab.name === 'logout'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      <span>{{ tab.label }}</span>
    </component>
  </nav>
</template>
