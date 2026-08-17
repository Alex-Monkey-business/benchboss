<script setup>
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
  <div class="other-teams">
    <router-link
      v-for="item in items"
      :key="item.color"
      :to="item.to"
      class="other-row"
    >
      <span class="other-row__tags">
        <span
          v-for="c in tags(item)"
          :key="c"
          class="other-row__tag"
          :class="`other-row__tag--${c}`"
        >{{ teamLabel(c) }}</span>
      </span>
      <span class="other-row__body">
        <span class="other-row__title">{{ line(item) }}</span>
        <span class="other-row__sub">{{ sub(item) }}</span>
      </span>
      <svg class="other-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </router-link>
  </div>
</template>

<style scoped>
.other-teams {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.other-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  padding: 14px var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  text-decoration: none;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
  transition:
    border-color var(--ds-duration-fast) var(--ds-ease-out),
    transform var(--ds-duration-fast) var(--ds-ease-out);
}

.other-row:active { transform: scale(0.99); }

@media (hover: hover) and (pointer: fine) {
  .other-row:hover { border-color: var(--ds-color-border-strong); }
}

/* To merkelapper når to Halsen-lag møtes — én kamp, begge lagene navngitt. */
.other-row__tags {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex-shrink: 0;
}

.other-row__tag {
  flex-shrink: 0;
  min-width: 44px;
  text-align: center;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
}

.other-row__tag--gronn { background: var(--ds-team-gronn-bg); color: var(--ds-team-gronn); }
.other-row__tag--rod   { background: var(--ds-team-rod-bg);   color: var(--ds-team-rod); }
.other-row__tag--hvit  { background: var(--ds-team-hvit-bg);  color: var(--ds-team-hvit); border: 1px solid var(--ds-team-hvit-border); }

.other-row__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.other-row__title {
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.other-row__sub {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.other-row__chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ds-color-text-tertiary);
}
</style>
