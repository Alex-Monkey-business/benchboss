<script setup>
import { computed } from 'vue'
import { useCupTeams } from '../composables/useCupTeams'
import { useCupFilter } from '../composables/useCupFilter'

const { teamFilter, setFilter } = useCupFilter()
const { cupTeams } = useCupTeams()

// Ett lag er ikke et valg. Filteret vises bare når det er noe å filtrere.
const options = computed(() => cupTeams.value.length < 2 ? [] : [
  { slug: 'all', label: 'Alle' },
  ...cupTeams.value.map(t => ({ slug: t.slug, label: t.name }))
])
</script>

<template>
  <div v-if="options.length" class="ds-pills cupfilter">
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
