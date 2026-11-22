<script setup>
import Ikon from './Ikon.vue'
import { isOurs } from '../lib/matchMeta'
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useMatches } from '../composables/useMatches'
import { useFeatures } from '../composables/useFeatures'
import { useExpenses } from '../composables/useExpenses'
import { useCups } from '../composables/useCups'
import { useCupFirst } from '../composables/useCupFirst'
import { localISODate } from '../lib/dateLabels'

const route = useRoute()
const router = useRouter()
const { coach, isParent, logout } = useAuth()
const { usesReferees } = useFeatures()
const { matches, getCoachesForMatch } = useMatches()
const { getExpenseForMatch } = useExpenses()
const { cupInProgress, fetchCups } = useCups()
const { cupFirst, fetchSerieStatus } = useCupFirst()

onMounted(() => { fetchCups(); fetchSerieStatus() })

// Trenere får full meny; foreldre får read-only-sidene + logg ut.
// Samme komponent → bunnmeny på mobil, toppmeny på desktop (se app.css).
//
// Kamper-fanen er cup-fanen i et kull uten serie. Den ERSTATTES, den legges
// ikke ved siden av: /kamper er en side som aldri kommer til å ha noe på seg
// for et G6-lag, og en permanent tom fane er verre enn ingen fane.
const COACH_TABS = computed(() => [
  { name: 'hjem', label: 'Hjem', path: '/' },
  cupFirst.value
    ? { name: 'cup', label: 'Cup', path: '/cup' }
    : { name: 'matches', label: 'Kamper', path: '/kamper' },
  { name: 'trening', label: 'Trening', path: '/trening' },
  { name: 'stats', label: 'Statistikk', path: '/statistikk' },
  { name: 'admin', label: 'Admin', path: '/admin' }
])
// Cup-fanen kommer og går med cupen — samme regel som Hjem-kortet hos trenerne.
// Uten serie står den permanent: det er den eneste kampflata som finnes.
const PARENT_TABS = computed(() => [
  { name: 'serie', label: 'Kamper', path: '/serie' },
  { name: 'tropp', label: 'Tropp', path: '/serie/tropp' },
  { name: 'cup', label: 'Cup', path: '/cup' },
  { name: 'logout', label: 'Logg ut', action: 'logout' }
])
const tabs = computed(() => {
  if (!isParent.value) return COACH_TABS.value
  return PARENT_TABS.value.filter(t => t.name !== 'cup' || cupInProgress.value || cupFirst.value)
})

function isActive(tab) {
  if (tab.name === 'hjem') return route.path === '/'
  if (tab.name === 'matches') return route.path === '/kamper' || route.path.startsWith('/kamp/')
  if (tab.name === 'trening') return route.path.startsWith('/trening') || route.path.startsWith('/del-inn')
  if (tab.name === 'tropp') return route.path.startsWith('/serie/tropp')
  if (tab.name === 'serie') return route.path === '/serie'
  // Admin eier alt som åpnes derfra: tropp, spiller, trener og hele cupen
  // (liste, tropp og kamp), så fanen ikke hopper mellom lista og kampen.
  // Har kullet cup som sin egen fane, er det fanen som skal lyse.
  if (tab.name === 'admin') {
    const p = route.path
    return p === '/admin' || p.startsWith('/admin/') || p.startsWith('/serie/tropp') ||
      p.startsWith('/spiller/') || p.startsWith('/trener/') || (!cupFirst.value && p.startsWith('/cup'))
  }
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
  // Skaffer laget ikke dommer selv, føres det aldri utlegg — da ville prikken
  // stått rød for alltid uten at det fantes noe å gjøre med den.
  if (!usesReferees.value) return 0
  if (!coach.value || !matches.value?.length) return 0
  const today = localISODate()
  return matches.value.filter(m =>
    isOurs(m.home_team) &&
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
      <!-- Ikonet står i en pille; den aktive fanen fyller pillen. -->
      <span class="bottom-nav__icon-wrap">
      <!-- Hjem (hus) -->
      <Ikon navn="hjem" v-if="tab.name === 'hjem'" />
      <span v-if="tab.name === 'hjem' && pendingCount > 0" class="bottom-nav__badge" aria-label="venter på handling"></span>
      <!-- Kamper (serie) -->
      <Ikon navn="kalender" v-if="tab.name === 'matches' || tab.name === 'serie'" />
      <!-- Tropp (drakt) -->
      <Ikon navn="drakt" v-if="tab.name === 'tropp'" />
      <!-- Trening (kjegle) -->
      <Ikon navn="kjegle" v-if="tab.name === 'trening'" />
      <!-- Statistikk -->
      <Ikon navn="statistikk" v-if="tab.name === 'stats'" />
      <!-- Cup (pokal) -->
      <Ikon navn="pokal" v-if="tab.name === 'cup'" />
      <!-- Admin -->
      <Ikon navn="innstillinger" v-if="tab.name === 'admin'" />
      <!-- Logg ut -->
      <Ikon navn="logg-ut" v-if="tab.name === 'logout'" />
      </span>
      <span>{{ tab.label }}</span>
    </component>
  </nav>
</template>
