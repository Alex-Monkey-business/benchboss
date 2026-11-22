<script setup>
import Ikon from '../Ikon.vue'
import { teamLabel } from '../../lib/matchMeta'
import { weekdayDateLabel } from '../../lib/dateLabels'

// De andre lagenes neste kamp. Bevisst lettere enn NextMatchCard — samme
// informasjon, mindre vekt, så egen kamp fortsatt er det øyet lander på.
defineProps({
  items: { type: Array, default: () => [] }
})

// Dag, ikke dato-klokkeslett-sted. Dette er lag du IKKE trener — du skal vite
// at det skjer, ikke planlegge det. Klokkeslett og bane står inne på kampen.
//
// Formatet lå duplisert her og i kampkortet. Nå én funksjon, så de ikke kan
// begynne å sprike.
const dayLabel = weekdayDateLabel

// Møter to Halsen-lag hverandre, er det én kamp med to merkelapper — ikke to
// rader. «Hjemme/borte» sier heller ingenting når begge er oss.
const tags = item => item.colors || [item.color]

function line(item) {
  return tags(item).length > 1 ? 'mot hverandre' : `mot ${item.opponent}`
}

function sub(item) {
  const day = dayLabel(item.date)
  return tags(item).length > 1 ? day : `${day} · ${item.isHome ? 'hjemme' : 'borte'}`
}
</script>

<template>
  <div class="ds-rows">
    <router-link
      v-for="item in items"
      :key="item.color"
      :to="item.to"
      class="ds-row other-row"
    >
      <span class="other-row__tags">
        <span
          v-for="c in tags(item)"
          :key="c"
          class="ds-tag"
          :class="`ds-tag--${c}`"
        >{{ teamLabel(c) }}</span>
      </span>
      <span class="ds-row__body">
        <span class="ds-row__title other-row__title">{{ line(item) }}</span>
        <span class="ds-row__sub">{{ sub(item) }}</span>
      </span>
      <Ikon navn="pil-hoyre" class="ds-row__chevron" />
    </router-link>
  </div>
</template>

<style scoped>
/* Radformen og lappene bor i designsystemet (.ds-row, .ds-tag). */

/* To merkelapper når to Halsen-lag møtes — én kamp, begge lagene navngitt. */
.other-row__tags {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--ds-space-xs);
  flex-shrink: 0;
  min-width: 52px;
}

/* Andre lag er bevisst lettere enn egne: samme rad, dempet tittel. */
.other-row__title {
  color: var(--ds-color-text-secondary);
}
</style>
