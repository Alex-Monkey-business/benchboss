<script setup>
import { computed } from 'vue'
import { relativeDateLabel } from '../../lib/dateLabels'
import { sessionIllustration, illoWebp, illoPng as illoPngPath } from '../../lib/sessionVisuals'
import { dagLink } from '../../lib/trainingLinks'

const props = defineProps({
  period: { type: Object, required: true },
  session: { type: Object, required: true },
  date: { type: String, required: true }
})

// Ukedagen velger bildet (lib/sessionVisuals).
const illo = computed(() => sessionIllustration(props.session))
const illoSrc = computed(() => illoWebp(illo.value))
const illoPng = computed(() => illoPngPath(illo.value))

const when = computed(() => relativeDateLabel(props.date))
const drillLine = computed(() => (props.session.drills || []).map(d => d.text).filter(Boolean).join(' · '))
</script>

<template>
  <router-link
    :to="dagLink(period.id, session.id)"
    class="ds-card ds-card--interactive next-training"
    :data-accent="session.accent || 'warm'"
  >
    <div class="next-training__top">
      <span class="next-training__kicker">Neste trening</span>
      <span class="next-training__when">{{ when }}</span>
    </div>

    <div class="next-training__main">
      <p v-if="session.focus" class="next-training__focus">{{ session.focus }}</p>
      <p v-else class="next-training__focus">{{ session.title }}</p>
      <picture v-if="illo" class="next-training__illo">
        <source :srcset="illoSrc" type="image/webp" />
        <img :src="illoPng" alt="" loading="lazy" />
      </picture>
      <!-- Har ikke dagen egen illustrasjon, faller vi tilbake på state-ikonet,
           så kortet aldri står bildeløst ved siden av neste kamp. -->
      <img
        v-else
        class="next-training__illo next-training__illo--fallback"
        src="/illustrations/bench-boss-state-icons/512/upcoming-training-transparent.png"
        alt=""
        decoding="async"
      />
    </div>

    <p v-if="drillLine" class="next-training__drills">{{ drillLine }}</p>
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
.next-training[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.next-training[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.next-training[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.next-training[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.next-training[data-accent="sky"]        { --accent-bg: #DCEAF2; --accent-text: #2F5468; }
.next-training[data-accent="olive"]      { --accent-bg: #EAEAD8; --accent-text: #55552F; }

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

/* Skannbart glimt, ikke hele treninga: fokus klippes til to linjer. */
.next-training__focus {
  margin: 0;
  font-family: var(--ds-font-heading);
  /* lg, som treningskortet for i dag. Samme slags innhold — et fokus-utdrag
     — sto i to ulike størrelser på samme skjerm. */
  font-size: var(--ds-text-lg);
  line-height: 1.3;
  letter-spacing: -0.01em;
  /* Kortet beholder sin LYSE aksentbakgrunn i mørk modus — derfor kan ikke
     blekket følge temaet. --ds-color-text-primary flipper til nesten hvitt,
     og tittelen ble usynlig på lyseblått. Fast mørkt blekk: lik i lyst og
     mørkt tema. */
  color: #0A0A0A;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.next-training__illo {
  width: 64px;
  flex-shrink: 0;
}

.next-training__illo img {
  width: 100%;
  height: auto;
  display: block;
}

/* Krymp, ikke skjul. Kampkortet krymper til 56 under 380px — at
   treningskortene i stedet fjernet bildet gjorde at kortene så ut som to
   ulike komponenter så snart skjermen ble smal. */
@media (max-width: 379px) {
  .next-training__illo { width: 56px; }
}

/* Øvelsene som én kompakt linje — maks to ved mange øvelser. */
.next-training__drills {
  margin: 0;
  font-size: var(--ds-text-xs);
  line-height: 1.5;
  color: var(--accent-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Smal skjerm: kortene med bildekolonne har bare ~200px til teksten når
   padding er lg. Da brekker «Onsdag 19 aug · 18:00» midt i. Strammere ramme
   gir 16px tilbake til innholdet — samme regel for alle tre, så de ikke
   begynner å oppføre seg ulikt igjen. */
@media (max-width: 360px) {
  .next-training { padding: var(--ds-space-md); }
}
</style>
