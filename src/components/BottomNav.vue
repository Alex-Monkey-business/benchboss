<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const tabs = [
  { name: 'matches', label: 'Kamper', path: '/' },
  { name: 'season', label: 'Dommerutlegg', path: '/sesong' },
  { name: 'more', label: 'Mer', path: '/mer' }
]

function isActive(tab) {
  if (tab.name === 'matches') return route.path === '/' || route.path.startsWith('/kamp')
  return route.path === tab.path
}
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
      <svg v-if="tab.name === 'matches'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <!-- Dommerutlegg (Vipps smile icon from brand kit) -->
      <svg v-if="tab.name === 'season'" viewBox="35 22 40 28" fill="currentColor" stroke="none">
        <path d="M57.3,40.7c3.7,0,5.8-1.8,7.8-4.4c1.1-1.4,2.5-1.7,3.5-0.9s1.1,2.3,0,3.7c-2.9,3.8-6.6,6.1-11.3,6.1
          c-5.1,0-9.6-2.8-12.7-7.7c-0.9-1.3-0.7-2.7,0.3-3.4s2.5-0.4,3.4,1C50.5,38.4,53.5,40.7,57.3,40.7z M64.2,28.4c0,1.8-1.4,3-3,3
          s-3-1.2-3-3s1.4-3,3-3S64.2,26.7,64.2,28.4z"/>
      </svg>
      <!-- Mer -->
      <svg v-if="tab.name === 'more'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="1"/>
        <circle cx="19" cy="12" r="1"/>
        <circle cx="5" cy="12" r="1"/>
      </svg>
      <span>{{ tab.label }}</span>
    </router-link>
  </nav>
</template>
