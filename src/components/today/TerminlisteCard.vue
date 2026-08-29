<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { trimAbbrevDots, weekdayDateLabel } from '../../lib/dateLabels'

// Nyheten, ikke handlingen. «Å ordne» er ting man må gjøre; dette er noe
// kretsen har gjort, og som man bør vite før man møter opp til feil tid.
const props = defineProps({
  endringer: { type: Object, required: true }
})

const router = useRouter()

const antallFlyttet = computed(() => props.endringer?.endret?.length || 0)
const antallNye = computed(() => props.endringer?.nye?.length || 0)

const tittel = computed(() => {
  const deler = []
  if (antallFlyttet.value) deler.push(`${antallFlyttet.value} ${antallFlyttet.value === 1 ? 'kamp' : 'kamper'} er flyttet`)
  if (antallNye.value) deler.push(`${antallNye.value} ${antallNye.value === 1 ? 'ny kamp' : 'nye kamper'}`)
  return deler.join(' · ')
})

// Konsekvensen først: hvilken kamp, og når den er nå. Ikke «terminlista er
// oppdatert», som ikke sier noe om hvor man skal møte opp.
const forste = computed(() => {
  const e = props.endringer?.endret?.[0] || props.endringer?.nye?.[0]
  if (!e) return ''
  const nar = `${trimAbbrevDots(weekdayDateLabel(e.date))}${e.time ? ' ' + e.time : ''}`
  return `${e.homeTeam} – ${e.awayTeam}: ${nar}`
})
</script>

<template>
  <button type="button" class="ds-card ds-card--interactive terminliste-kort" @click="router.push('/admin/sesong-kamper')">
    <span class="terminliste-kort__tekst">
      <span class="terminliste-kort__tittel">{{ tittel }}</span>
      <span class="terminliste-kort__sub">{{ forste }}</span>
      <span v-if="antallFlyttet + antallNye > 1" class="terminliste-kort__sub">Se alle endringene fra fotball.no</span>
    </span>
    <svg class="terminliste-kort__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
  </button>
</template>

<style scoped>
.terminliste-kort {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  width: 100%;
  padding: var(--ds-space-lg);
  text-align: left;
  cursor: pointer;
}

.terminliste-kort__tekst {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.terminliste-kort__tittel {
  font-size: var(--ds-text-base);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

.terminliste-kort__sub {
  font-size: var(--ds-text-sm);
  line-height: 1.4;
  color: var(--ds-color-text-secondary);
}

.terminliste-kort__chevron {
  flex: none;
  width: 16px;
  height: 16px;
  color: var(--ds-color-text-tertiary);
}
</style>
