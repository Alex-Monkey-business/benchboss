<script setup>
import { computed, watch } from 'vue'
import { useSeasonTeams } from '../composables/useSeasonTeams'

const props = defineProps({
  modelValue: { type: String, default: 'alle' },
  counts: { type: Object, default: () => ({}) },
  // Uten egen «Alle»: lagene slås av og på, og nullstillingen bor i en
  // annen rad (Kamper har én «Alle» for både sted og lag).
  utenAlle: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

// Lagene i sesongen som vises: i fjor Grønn, Rød, Hvit, i år A, B, C.
const { viewingTeams } = useSeasonTeams()
const filters = computed(() => [
  ...(props.utenAlle ? [] : [{ key: 'alle', label: 'Alle' }]),
  ...viewingTeams.value.map(t => ({ key: t.slug, label: t.name }))
])
// Et valgt lag som ikke finnes i sesongen, ville gitt en tom liste uten
// synlig filter. Tilbake til alle.
watch(() => viewingTeams.value.map(t => t.slug).join(), () => {
  const k = props.modelValue
  if (k && k !== 'alle' && !viewingTeams.value.some(t => t.slug === k)) emit('update:modelValue', 'alle')
}, { immediate: true })
function velg(key) {
  emit('update:modelValue', props.utenAlle && props.modelValue === key ? 'alle' : key)
}
</script>

<template>
  <div class="ds-pills">
    <button
      v-for="f in filters"
      :key="f.key"
      :class="['ds-pill', 'team-pill', `team-pill--${f.key}`, { 'ds-pill--active': modelValue === f.key }]"
      @click="velg(f.key)"
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
  gap: var(--ds-space-sm);
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
