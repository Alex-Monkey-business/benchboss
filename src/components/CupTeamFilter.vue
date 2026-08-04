<script setup>
import { computed } from 'vue'
import { CUP_TEAMS } from '../lib/cupTeams'
import { useCupFilter } from '../composables/useCupFilter'

const { teamFilter, setFilter } = useCupFilter()

const options = computed(() => [
  { slug: 'all', label: 'Alle' },
  ...CUP_TEAMS.map(t => ({ slug: t.slug, label: t.name }))
])
</script>

<template>
  <div class="ds-pills cupfilter">
    <button
      v-for="o in options"
      :key="o.slug"
      type="button"
      class="ds-pill"
      :class="{ 'ds-pill--active': teamFilter === o.slug }"
      @click="setFilter(o.slug)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.cupfilter { margin-bottom: var(--ds-space-lg); }
</style>
