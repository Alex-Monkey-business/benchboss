<script setup>
import { computed } from 'vue'
import { useSeasonTeams } from '../composables/useSeasonTeams'

defineProps({
  modelValue: { type: String, default: 'alle' },
  counts: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue'])

const { seasonTeams } = useSeasonTeams()
const filters = computed(() => [
  { key: 'alle', label: 'Alle' },
  ...seasonTeams.value.map(t => ({ key: t.slug, label: t.name }))
])
</script>

<template>
  <div class="ds-pills">
    <button
      v-for="f in filters"
      :key="f.key"
      :class="['ds-pill', 'team-pill', `team-pill--${f.key}`, { 'ds-pill--active': modelValue === f.key }]"
      @click="emit('update:modelValue', f.key)"
    >
      <span v-if="f.key !== 'alle'" :class="['team-pill__dot', `team-pill__dot--${f.key}`]" aria-hidden="true"></span>
      {{ f.label }}
      <span v-if="counts[f.key]" class="ds-pill__count">{{ counts[f.key] }}</span>
    </button>
  </div>
</template>

<style scoped>
.team-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.team-pill__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.team-pill__dot--gronn {
  background: var(--ds-team-gronn);
}

.team-pill__dot--rod {
  background: var(--ds-team-rod);
}

.team-pill__dot--hvit {
  background: var(--ds-team-hvit-bg);
  border: 1px solid var(--ds-team-hvit-border);
}
</style>
