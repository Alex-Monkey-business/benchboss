<script setup>
// Ukeliste — «Denne uka» på Hjem (trenere, tappbar) og /serie (foreldre, read-only).
defineProps({
  items: { type: Array, default: () => [] },
  interactive: { type: Boolean, default: true }
})

import { isToday, trimAbbrevDots } from '../../lib/dateLabels'

function weekDayLabel(iso) {
  if (isToday(iso)) return 'I dag'
  const s = new Date(iso + 'T12:00:00').toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })
  return trimAbbrevDots(s.charAt(0).toUpperCase() + s.slice(1))
}

// «Tir 18» — kort nok til at fem av dem får plass på én linje.
function shortDay(iso) {
  const s = new Date(iso + 'T12:00:00').toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric' })
  return trimAbbrevDots(s.charAt(0).toUpperCase() + s.slice(1))
}

function dayColumn(item) {
  return item.kind === 'training-week' ? 'Uka' : weekDayLabel(item.date)
}

function title(item) {
  if (item.kind === 'training-week') return `${item.count} treninger`
  if (item.kind === 'training') return 'Trening'
  if (item.kind === 'cup') return `Cup mot ${item.opponent}`
  return `Kamp mot ${item.opponent}`
}

function sub(item) {
  if (item.kind === 'training-week') return item.dates.map(shortDay).join(' · ')
  // Et blikk, ikke planen: antallet. Øvelsene står på Trening.
  if (item.kind === 'training') {
    const n = (item.drills || []).filter(d => d?.text).length
    return n ? `${n} ${n === 1 ? 'øvelse' : 'øvelser'}` : ''
  }
  const parts = []
  if (item.kind === 'match') parts.push(item.isHome ? 'Hjemme' : 'Borte')
  if (item.time) parts.push(item.time)
  return parts.join(' · ')
}
</script>

<template>
  <div class="ds-rows">
    <component
      :is="interactive ? 'router-link' : 'div'"
      v-for="(item, i) in items"
      :key="i"
      :to="interactive ? item.to : undefined"
      class="ds-row"
    >
      <span class="ds-row__lead">{{ dayColumn(item) }}</span>
      <div class="ds-row__body">
        <span class="ds-row__title">{{ title(item) }}</span>
        <span v-if="sub(item)" class="ds-row__sub">{{ sub(item) }}</span>
      </div>
      <svg v-if="interactive" class="ds-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      <!-- Økta får hele bredden under dagen; ved siden av datokolonnen ble
           navnene klippet til «Eggs (transi…» på en Samsung. -->
    </component>
  </div>
</template>
<!-- Radformen bor i design-system/components/_cards.css (.ds-row). -->
