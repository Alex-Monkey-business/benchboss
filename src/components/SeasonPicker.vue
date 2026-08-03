<script setup>
import { ref, computed } from 'vue'
import { useSeasons } from '../composables/useSeasons'
import Sheet from './Sheet.vue'

// variant 'title': sesongnavnet ER sidetittelen (Kamper/Serie).
// variant 'compact': subtittel-størrelse (Statistikk m.fl.).
const props = defineProps({
  variant: { type: String, default: 'compact' }
})

const { seasons, activeSeason, viewingSeason, isViewingPast, setViewingSeason } = useSeasons()

const showSheet = ref(false)

const canSwitch = computed(() => seasons.value.length > 1)

function isDbActive(s) {
  return s.id === activeSeason.value?.id && s.status !== 'settled'
}

function pick(seasonId) {
  setViewingSeason(seasonId)
  showSheet.value = false
}
</script>

<template>
  <div class="season-picker" :class="`season-picker--${variant}`">
    <component
      :is="canSwitch ? 'button' : 'span'"
      :type="canSwitch ? 'button' : undefined"
      class="season-picker__trigger"
      :class="{ 'season-picker__trigger--static': !canSwitch }"
      @click="canSwitch && (showSheet = true)"
    >
      <span :class="variant === 'title' ? 'page-header__title' : 'season-picker__label'">
        {{ viewingSeason?.name || 'Kampoversikt' }}
      </span>
      <svg
        v-if="canSwitch"
        class="season-picker__chevron"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
      ><polyline points="6 9 12 15 18 9"/></svg>
    </component>

    <div v-if="isViewingPast" class="season-picker__past">
      Tidligere sesong
      <button type="button" class="season-picker__reset" @click="setViewingSeason(activeSeason.id)">
        Til {{ activeSeason?.name }}
      </button>
    </div>

    <Sheet :show="showSheet" title="Sesong" @close="showSheet = false">
      <div class="season-picker__list">
        <button
          v-for="s in seasons"
          :key="s.id"
          type="button"
          class="season-picker__item"
          :class="{ 'season-picker__item--current': s.id === viewingSeason?.id }"
          @click="pick(s.id)"
        >
          <span class="season-picker__item-name">{{ s.name }}</span>
          <span
            v-if="s.status === 'settled'"
            class="ds-badge ds-badge--subtle season-picker__badge"
          >Avsluttet</span>
          <span
            v-else-if="isDbActive(s)"
            class="ds-badge ds-badge--accent season-picker__badge"
          >Aktiv</span>
          <svg
            v-if="s.id === viewingSeason?.id"
            class="season-picker__check"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
          ><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>
    </Sheet>
  </div>
</template>

<style scoped>
.season-picker {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.season-picker__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}
.season-picker__trigger--static {
  cursor: default;
}

.season-picker__label {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  font-weight: 500;
}

.season-picker__chevron {
  width: 16px;
  height: 16px;
  color: var(--ds-color-text-tertiary);
  flex-shrink: 0;
  transition: color 0.15s;
}
.season-picker--title .season-picker__chevron {
  width: 20px;
  height: 20px;
  margin-top: 2px;
}
.season-picker__trigger:hover .season-picker__chevron {
  color: var(--ds-color-text-primary);
}

.season-picker__past {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--ds-text-xs);
  font-weight: 500;
  color: var(--ds-color-warm-text);
}
.season-picker__reset {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--ds-text-xs);
  font-weight: 600;
  color: var(--ds-color-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.season-picker__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.season-picker__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  background: var(--ds-color-bg-subtle);
  border: 1px solid transparent;
  border-radius: var(--ds-radius-sm);
  cursor: pointer;
  font-size: var(--ds-text-sm);
  font-weight: 500;
  color: var(--ds-color-text-primary);
  transition: all 0.15s;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}
.season-picker__item:hover {
  background: var(--ds-color-accent-light);
  border-color: var(--ds-color-accent);
}
.season-picker__item--current {
  border-color: var(--ds-color-accent);
  background: var(--ds-color-accent-light);
}
.season-picker__item-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.season-picker__badge {
  font-size: 0.65rem;
  flex-shrink: 0;
}
.season-picker__check {
  width: 16px;
  height: 16px;
  color: var(--ds-color-accent);
  flex-shrink: 0;
}
</style>
