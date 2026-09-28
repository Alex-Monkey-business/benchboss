<script setup>
import { computed } from 'vue'
import Spot from '../Spot.vue'
import OktListe from '../OktListe.vue'
import { sessionMotif } from '../../lib/sessionVisuals'
import { dagLink } from '../../lib/trainingLinks'

const props = defineProps({
  session: { type: Object, required: true }
})

// Samme bilde som økta selv viser — ukedagen velger det (lib/sessionVisuals).
const motif = computed(() => sessionMotif(props.session))

const harOvelser = computed(() => (props.session.drills || []).some(d => d?.text))

</script>

<template>
  <router-link
    :to="dagLink(session.id)"
    class="ds-card ds-card--interactive today-training"
    :data-accent="session.accent || 'warm'"
  >
    <div class="today-training__content">
      <span class="today-training__kicker">Trening i dag</span>
      <OktListe v-if="harOvelser" class="today-training__okt" :drills="session.drills" :maks="3" />
      <p v-else class="today-training__tom">Ingen øvelser ennå</p>
    </div>
    <!-- Pasningsøkta spiller ballen gjennom portene én gang når kortet vises. -->
    <Spot v-if="motif" :name="motif" class="today-training__illo" :size="64" :play="motif === 'passing' ? 'auto' : false" />
  </router-link>
</template>

<style scoped>
.today-training {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--ds-space-md);
  padding: var(--ds-space-lg);
  text-decoration: none;
  background: var(--accent-bg, var(--ds-color-surface));
  border-color: transparent;
}

/* Accent-paletten fra treningsplanen — solid bakgrunn, ingen gradients. */

.today-training__content {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  min-width: 0;
}

.today-training__kicker {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-text, var(--ds-color-text-secondary));
}


/* Detalj: dempet støttetekst under temaet. Hel — en setning som slutter i
   «…» sier mindre enn ingen setning. */
.today-training__tom {
  margin: 0;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-regular);
  color: var(--accent-text, var(--ds-color-text-secondary));
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

/* Nummer og minutter i kortets egen farge, så de hører til flaten. */
.today-training__okt {
  --okt-nr-bg: color-mix(in srgb, var(--accent-text, var(--ds-color-accent)) 12%, transparent);
  --okt-dempet: var(--accent-text, var(--ds-color-text-tertiary));
}
</style>
