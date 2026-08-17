<script setup>
import { computed } from 'vue'
import { sessionIllustration, illoWebp, illoPng as illoPngPath } from '../../lib/sessionVisuals'

const props = defineProps({
  period: { type: Object, required: true },
  session: { type: Object, required: true }
})

// Samme bilde som økta selv viser — ukedagen velger det (lib/sessionVisuals).
const illo = computed(() => sessionIllustration(props.session))
const illoSrc = computed(() => illoWebp(illo.value))
const illoPng = computed(() => illoPngPath(illo.value))

const drillCount = computed(() => (props.session.drills || []).length)
const drillLabel = computed(() => drillCount.value === 1 ? '1 øvelse' : `${drillCount.value} øvelser`)

// Focus er skrevet som «[Kort tema]. [Detalj].» — splitt så temaet blir hero
// og detaljen dempet støttetekst. Skannbart i ett blikk, ikke en vegg.
const focusParts = computed(() => {
  const f = (props.session.focus || '').trim()
  if (!f) return { lead: props.session.title || '', detail: '' }
  const m = f.match(/^(.+?[.!?])\s+(.+)$/s)
  if (m && m[1].length <= 48) return { lead: m[1], detail: m[2] }
  return { lead: f, detail: '' }
})
</script>

<template>
  <router-link
    :to="`/trening/${period.id}/okt/${session.id}`"
    class="ds-card ds-card--interactive today-training"
    :data-accent="session.accent || 'warm'"
  >
    <div class="today-training__content">
      <span class="today-training__kicker">Trening i dag</span>
      <p class="today-training__title">{{ focusParts.lead }}</p>
      <p v-if="focusParts.detail" class="today-training__focus">{{ focusParts.detail }}</p>
      <span v-if="drillCount" class="today-training__meta">{{ drillLabel }}</span>
    </div>
    <picture v-if="illo" class="today-training__illo">
      <source :srcset="illoSrc" type="image/webp" />
      <img :src="illoPng" alt="" loading="lazy" />
    </picture>
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
.today-training[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.today-training[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.today-training[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.today-training[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.today-training[data-accent="sky"]        { --accent-bg: #DCEAF2; --accent-text: #2F5468; }
.today-training[data-accent="olive"]      { --accent-bg: #EAEAD8; --accent-text: #55552F; }

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

/* Hero: det korte temaet — punchy, skannbart, maks to linjer. */
.today-training__title {
  margin: 0;
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-lg);
  line-height: 1.3;
  letter-spacing: -0.01em;
  /* Kortet beholder sin LYSE aksentbakgrunn i mørk modus — derfor kan ikke
     blekket følge temaet. --ds-color-text-primary flipper til nesten hvitt,
     og tittelen ble usynlig på lyseblått. Fast mørkt blekk, samme mønster som
     kapittel-panelet i økt-visningen: lik i lyst og mørkt tema. */
  color: #0A0A0A;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Detalj: dempet støttetekst under temaet, klemt til to linjer. */
.today-training__focus {
  margin: 0;
  font-size: var(--ds-text-sm);
  line-height: 1.4;
  color: var(--accent-text, var(--ds-color-text-secondary));
  opacity: 0.85;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.today-training__meta {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  color: var(--accent-text, var(--ds-color-text-tertiary));
}

.today-training__illo {
  /* 64 som de andre kortene. I 88 ble treningskortet fysisk STØRRE enn
     kampkortet, som er skjermens viktigste — vekten sa det motsatte av
     rekkefølgen. */
  width: 64px;
  flex-shrink: 0;
}

.today-training__illo img {
  width: 100%;
  height: auto;
  display: block;
}

/* Krymp, ikke skjul. Kampkortet krymper til 56 under 380px — at
   treningskortene i stedet fjernet bildet gjorde at kortene så ut som to
   ulike komponenter så snart skjermen ble smal. */
@media (max-width: 379px) {
  .today-training__illo { width: 56px; }
}
</style>
