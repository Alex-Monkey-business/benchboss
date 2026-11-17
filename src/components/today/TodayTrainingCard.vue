<script setup>
import { computed } from 'vue'
import Spot from '../Spot.vue'
import { sessionMotif } from '../../lib/sessionVisuals'
import { dagLink } from '../../lib/trainingLinks'

const props = defineProps({
  session: { type: Object, required: true },
  // Trenere går rett til opptellingen, eller kjøreplanen når den er lagret.
  til: { type: String, default: null },
  // Dagens oppmøte: antall her, null = ikke telt opp ennå, undefined = vis ikke.
  oppmote: { type: Number, default: undefined }
})

// Samme bilde som økta selv viser — ukedagen velger det (lib/sessionVisuals).
const motif = computed(() => sessionMotif(props.session))

// Hjem er et blikk, ikke planen: lengden og antallet. Øvelsene står på Trening.
function varighet(min) {
  if (!min) return ''
  const t = Math.floor(min / 60), m = min % 60
  return !t ? `${m} min` : m ? `${t} t ${m} min` : `${t} t`
}
const antall = computed(() => (props.session.drills || []).filter(d => d?.text).length)
// Overskriften er fokuset når det er kort nok til å være en tittel, ellers
// dagen («Tirsdag»). Lengden står i linja under.
const tittel = computed(() => {
  const fokus = (props.session.focus || '').split(/[.!?]/)[0].trim()
  if (fokus && fokus.length <= 32) return fokus
  return props.session.title || 'Trening'
})
const linje = computed(() => {
  const deler = []
  const tid = varighet(props.session.duration_min)
  if (tid) deler.push(tid)
  if (props.oppmote != null) deler.push(`${props.oppmote} her`)
  else deler.push(antall.value ? `${antall.value} ${antall.value === 1 ? 'øvelse' : 'øvelser'}` : 'Ingen øvelser ennå')
  return deler
})

</script>

<template>
  <router-link
    :to="til || dagLink(session.id)"
    class="ds-card ds-card--interactive today-training"
    :data-accent="session.accent || 'warm'"
  >
    <div class="today-training__content">
      <span class="ds-eyebrow today-training__kicker">Trening i dag</span>
      <span class="today-training__tekst">
        <span class="today-training__tittel">{{ tittel }}</span>
        <!-- Hver del holdes samlet: linja brekker ved «·», aldri midt i «4 øvelser». -->
        <span class="today-training__linje"><template v-for="(d, i) in linje" :key="i"><template v-if="i"> · </template><span class="today-training__del">{{ d }}</span></template></span>
      </span>
    </div>
    <!-- Pasningsøkta spiller ballen gjennom portene én gang når kortet vises. -->
    <Spot v-if="motif" :name="motif" class="today-training__illo" :size="64" :play="motif === 'passing' ? 'auto' : false" />
    <svg class="today-training__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
  </router-link>
</template>

<style scoped>
.today-training__chevron {
  width: 20px;
  height: 20px;
  flex: none;
  color: var(--ds-color-text-tertiary);
}
.today-training {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: var(--ds-space-md);
  padding: var(--ds-space-lg);
  text-decoration: none;
  /* Ekte kortflate, ikke dagfargen: i mørk modus ble taupe en grå, død
     flate ved siden av de grønntonede kortene. */
  background: var(--ds-color-bg-elevated);
  border-color: var(--ds-color-border);
  box-shadow: var(--ds-shadow-sm);
}

.today-training__content {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  min-width: 0;
}

.today-training__kicker {
  color: var(--ds-color-accent);
}


.today-training__illo {
  --spot-size: 64px;
  /* 64 som de andre kortene. I 88 ble treningskortet fysisk STØRRE enn
     kampkortet, som er skjermens viktigste — vekten sa det motsatte av
     rekkefølgen. */
  width: 64px;
  flex-shrink: 0;
}

/* Krymp, ikke skjul. Kampkortet krymper til 56 under 380px — at
   treningskortene i stedet fjernet bildet gjorde at kortene så ut som to
   ulike komponenter så snart skjermen ble smal. */
@media (max-width: 379px) {
  .today-training__illo { width: 56px; --spot-size: 56px; }
}

/* Smal skjerm: kortene med bildekolonne har bare ~200px til teksten når
   padding er lg. Da brekker «Onsdag 19 aug · 18:00» midt i. Strammere ramme
   gir 16px tilbake til innholdet — samme regel for alle tre, så de ikke
   begynner å oppføre seg ulikt igjen. */
@media (max-width: 360px) {
  .today-training { padding: var(--ds-space-md); }
}

/* Samme grep som kampkortet: én overskrift, én linje. */
.today-training__tekst {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.today-training__tittel {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: var(--ds-color-text-primary);
}
.today-training__del { white-space: nowrap; }
.today-training__linje {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}
</style>
