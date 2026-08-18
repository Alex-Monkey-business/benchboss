<script setup>
// ETT REFERAT — lesing, ingenting annet.
//
// Punkter som ikke er vedtak, men noe noen skal finne ut av, er markert åpne
// med eier. Det er den eneste grunnen til å åpne et referat på nytt: ikke å
// lese hva vi bestemte, men å se hva som fortsatt henger.
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useCoaches } from '../composables/useCoaches'
import { useResponsibilities } from '../composables/useResponsibilities'
import { findMeeting } from '../content/meetings'

const { activeCohort } = useAuth()
const { coaches, fetchCoaches } = useCoaches()
const { fetchResponsibilities, ownerLabel } = useResponsibilities()

// Eieren av et åpent punkt utledes av ansvarsområdet, ikke skrevet inn som
// navn — flyttes ansvaret på trenersiden, flytter eieren seg her.
function eier(area) {
  return ownerLabel(area, coaches.value)
}

onMounted(async () => {
  const list = await fetchCoaches()
  if (activeCohort.value?.id) await fetchResponsibilities(activeCohort.value.id, list)
})

const route = useRoute()
const meeting = computed(() => findMeeting(route.params.slug))

// To punkter på rad som begge peker til konsekvenstrappa gir to like lenker
// under hverandre — det leses som en feil, ikke som en henvisning. Lenka står
// på det første punktet som nevner den, én gang per seksjon.
const seksjoner = computed(() =>
  (meeting.value?.sections || []).map(s => {
    const vist = new Set()
    return {
      ...s,
      points: s.points.map(p => {
        const visLenke = !!p.link && !vist.has(p.link.to)
        if (p.link) vist.add(p.link.to)
        return { ...p, visLenke }
      })
    }
  })
)

function dateLabel(iso) {
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<template>
  <div v-if="meeting" class="referat">
    <div class="referat__nav">
      <router-link to="/admin/referater" class="referat__back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Referater
      </router-link>
    </div>

    <header class="referat__hero">
      <span class="referat__date">{{ dateLabel(meeting.date) }}</span>
      <h1 class="referat__title">{{ meeting.title }}</h1>
      <p v-if="meeting.lead" class="referat__lead">{{ meeting.lead }}</p>
    </header>

    <section
      v-for="(s, si) in seksjoner"
      :key="si"
      class="seksjon"
      :data-accent="s.accent || 'warm'"
    >
      <h2 class="seksjon__heading">{{ s.heading }}</h2>

      <div
        v-for="(p, pi) in s.points"
        :key="pi"
        class="punkt"
        :class="{ 'punkt--open': p.open }"
      >
        <span v-if="p.open" class="punkt__flag">
          <span class="punkt__dot" aria-hidden="true"></span>
          Åpen<template v-if="eier(p.owner)"> · {{ eier(p.owner) }}</template>
        </span>
        <p class="punkt__text">{{ p.text }}</p>
        <router-link v-if="p.visLenke" :to="p.link.to" class="punkt__link">
          {{ p.link.label }}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </router-link>
      </div>
    </section>

    <footer class="referat__footer">
      <p>Referatet står som det ble skrevet. Endres noe, kommer det i neste møte.</p>
    </footer>
  </div>
</template>

<style scoped>
.seksjon[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.seksjon[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.seksjon[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.seksjon[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.seksjon[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
.seksjon[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }

:global([data-theme="dark"] .seksjon[data-accent="warm"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .seksjon[data-accent="sage"]) { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"] .seksjon[data-accent="cornflower"]) { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"] .seksjon[data-accent="peach"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .seksjon[data-accent="sky"]) { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"] .seksjon[data-accent="olive"]) { --accent-bg: #2A241A; --accent-text: #D9C99E; }

.referat {
  max-width: 680px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.referat__nav { margin-bottom: var(--ds-space-xl); }

.referat__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  letter-spacing: -0.005em;
}

.referat__back svg { width: 14px; height: 14px; }
.referat__back:hover { color: var(--ds-color-text-primary); }

.referat__hero { margin-bottom: var(--ds-space-2xl); }

.referat__date {
  display: inline-block;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  margin-bottom: var(--ds-space-md);
}

.referat__title {
  font-family: var(--ds-font-display);
  font-size: clamp(2.2rem, 7vw, 3.2rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.05;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0 0 var(--ds-space-lg);
}

.referat__lead {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-regular);
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-secondary);
  max-width: 34ch;
  margin: 0;
}

/* ---- Seksjon ---- */
.seksjon { margin-bottom: var(--ds-space-2xl); }

/* Overskriften bærer seksjonens farge. Fargen er navigasjon i en lang tekst —
   du husker at cup var den blå. */
.seksjon__heading {
  display: inline-block;
  margin: 0 0 var(--ds-space-lg);
  padding: 4px 12px;
  border-radius: var(--ds-radius-full);
  background: var(--accent-bg);
  color: var(--accent-text);
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
}

.punkt {
  padding: 0 0 var(--ds-space-lg);
}

.punkt:last-child { padding-bottom: 0; }

/* Et åpent punkt er ikke et vedtak — det får en tydelig venstrekant slik at
   det skiller seg fra teksten rundt uten å rope. */
.punkt--open {
  padding-left: var(--ds-space-md);
  border-left: 2px solid var(--accent-text);
}

.punkt__flag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--accent-text);
}

.punkt__dot {
  width: 7px;
  height: 7px;
  border-radius: var(--ds-radius-full);
  border: 1.5px solid currentColor;
}

.punkt__text {
  margin: 0;
  font-size: var(--ds-text-md);
  line-height: 1.55;
  color: var(--ds-color-text-primary);
  letter-spacing: -0.005em;
}

.punkt__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  letter-spacing: -0.005em;
}

.punkt__link svg { width: 13px; height: 13px; flex-shrink: 0; }
.punkt__link:hover { color: var(--ds-color-text-primary); }

.referat__footer {
  padding-top: var(--ds-space-xl);
  border-top: 1px solid var(--ds-color-border-light);
}

.referat__footer p {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  font-style: italic;
  margin: 0;
  letter-spacing: -0.005em;
}
</style>
