<script setup>
import { computed } from 'vue'
import Spot from '../Spot.vue'
import OktListe from '../OktListe.vue'
import { relativeDateLabel } from '../../lib/dateLabels'
import { sessionMotif } from '../../lib/sessionVisuals'
import { dagLink } from '../../lib/trainingLinks'

const props = defineProps({
  session: { type: Object, required: true },
  date: { type: String, required: true }
})

// Ukedagen velger bildet (lib/sessionVisuals).
const motif = computed(() => sessionMotif(props.session))

const when = computed(() => relativeDateLabel(props.date))
const harOvelser = computed(() => (props.session.drills || []).some(d => d?.text))
</script>

<template>
  <router-link
    :to="dagLink(session.id)"
    class="ds-card ds-card--interactive next-training"
    :data-accent="session.accent || 'warm'"
  >
    <div class="next-training__top">
      <span class="next-training__kicker">Neste trening</span>
      <span class="next-training__when">{{ when }}</span>
    </div>

    <div class="next-training__main">
      <OktListe v-if="harOvelser" class="next-training__okt" :drills="session.drills" :total="session.duration_min || 0" :maks="3" />
      <p v-else class="next-training__tom">Ingen øvelser ennå</p>
      <!-- Pasningsøkta spiller ballen gjennom portene én gang når kortet vises. -->
      <Spot v-if="motif" :name="motif" class="next-training__illo" :size="64" :play="motif === 'passing' ? 'auto' : false" />
      <!-- Har ikke dagen egen illustrasjon, faller vi tilbake på state-ikonet,
           så kortet aldri står bildeløst ved siden av neste kamp. -->
      <Spot v-else name="training" class="next-training__illo next-training__illo--fallback" :size="64" />
    </div>

  </router-link>
</template>

<style scoped>
.next-training {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-lg);
  text-decoration: none;
  background: var(--accent-bg, var(--ds-color-surface));
  border-color: transparent;
}

/* Accent-paletten fra treningsplanen — solid bakgrunn, ingen gradients. */

.next-training__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
}

.next-training__kicker {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-text);
}

.next-training__when {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  padding: 3px 10px;
  border-radius: var(--ds-radius-full);
  border: 1px solid var(--accent-text);
  color: var(--accent-text);
}

.next-training__main {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--ds-space-md);
}

.next-training__tom {
  margin: 0;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-regular);
  color: var(--accent-text, var(--ds-color-text-secondary));
}

.next-training__illo {
  width: 64px;
  --spot-size: 64px;
  flex-shrink: 0;
}

/* Krymp, ikke skjul. Kampkortet krymper til 56 under 380px — at
   treningskortene i stedet fjernet bildet gjorde at kortene så ut som to
   ulike komponenter så snart skjermen ble smal. */
@media (max-width: 379px) {
  .next-training__illo { width: 56px; --spot-size: 56px; }
}

/* Smal skjerm: kortene med bildekolonne har bare ~200px til teksten når
   padding er lg. Da brekker «Onsdag 19 aug · 18:00» midt i. Strammere ramme
   gir 16px tilbake til innholdet — samme regel for alle tre, så de ikke
   begynner å oppføre seg ulikt igjen. */
@media (max-width: 360px) {
  .next-training { padding: var(--ds-space-md); }
}

/* Stripa og minuttene i kortets egen farge, så de hører til flaten. */
.next-training__okt {
  --okt-farge: var(--accent-text, var(--ds-color-accent));
  --okt-spor: color-mix(in srgb, var(--accent-text, var(--ds-color-accent)) 16%, transparent);
  --okt-dempet: var(--accent-text, var(--ds-color-text-tertiary));
}
</style>
