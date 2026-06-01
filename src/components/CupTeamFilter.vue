<script setup>
import { computed } from 'vue'
import { CUP_TEAMS } from '../lib/cupTeams'
import { useCupFilter } from '../composables/useCupFilter'

const { teamFilter, setFilter } = useCupFilter()

const options = computed(() => [
  { slug: 'all', label: 'Alle' },
  ...CUP_TEAMS.map(t => ({ slug: t.slug, label: t.name.replace('Halsen IF ', '') }))
])
</script>

<template>
  <div class="cupfilter">
    <button
      v-for="o in options"
      :key="o.slug"
      type="button"
      :class="['cupfilter__pill', { 'cupfilter__pill--active': teamFilter === o.slug }]"
      @click="setFilter(o.slug)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.cupfilter {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-lg);
}
.cupfilter__pill {
  appearance: none;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  padding: 7px 15px;
  cursor: pointer;
  transition: background var(--ds-duration-fast) var(--ds-ease-out),
    color var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out);
}
.cupfilter__pill--active {
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
  border-color: var(--ds-color-accent);
}
</style>
