<script setup>
// MØTEREFERATER — det vi ble enige om.
//
// To blokker, og rekkefølgen er poenget: ansvarsområdene øverst fordi de
// overlever møtene og er det man faktisk slår opp («hvem tar dommerne?»),
// referatene under fordi de leses én gang og refereres til sjelden.
import { onMounted, computed } from 'vue'
import { useCoaches } from '../composables/useCoaches'
import { ansvarPerPerson } from '../content/ansvar'
import { meetingsByDate, openPoints } from '../content/meetings'

const { coaches, fetchCoaches } = useCoaches()

const referater = computed(() => meetingsByDate())

// Navnet er koblingsnøkkelen mot coaches-tabellen (UNIQUE der, og allerede
// nøkkelen COACH_IMAGES bruker). Finnes ikke raden — feilstavet, sluttet,
// aldri opprettet — står navnet likevel, med initial i stedet for foto.
// Ansvaret skal ikke forsvinne fordi et oppslag bommet.
const ansvarlige = computed(() =>
  ansvarPerPerson().map(p => ({
    ...p,
    coach: coaches.value.find(c => c.name === p.name) || null
  }))
)

function initial(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

function dateLabel(iso) {
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })
}

// «3 åpne» er grunnen til å åpne referatet igjen i november.
function openLabel(m) {
  const n = openPoints(m).length
  if (!n) return ''
  return n === 1 ? '1 åpen tråd' : `${n} åpne tråder`
}

onMounted(fetchCoaches)
</script>

<template>
  <div class="referater">
    <div class="referater__back-wrap">
      <router-link to="/admin" class="referater__back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Admin
      </router-link>
    </div>

    <header class="referater__hero">
      <span class="referater__eyebrow">Trenerteamet</span>
      <h1 class="referater__title">Det vi ble enige&nbsp;om</h1>
    </header>

    <section class="block">
      <h2 class="block__label">Ansvarsområder</h2>
      <ul class="ansvar">
        <li v-for="p in ansvarlige" :key="p.name" class="ansvar__row">
          <img v-if="p.coach?.image" :src="p.coach.image" alt="" class="ansvar__photo" />
          <span v-else class="ansvar__initial" aria-hidden="true">{{ initial(p.name) }}</span>
          <span class="ansvar__body">
            <span class="ansvar__name">{{ p.name }}</span>
            <span class="ansvar__areas">{{ p.areas.join(' · ') }}</span>
          </span>
        </li>
      </ul>
    </section>

    <section class="block">
      <h2 class="block__label">Referater</h2>
      <div class="referat-liste">
        <router-link
          v-for="m in referater"
          :key="m.slug"
          :to="`/admin/referater/${m.slug}`"
          class="referat-kort"
        >
          <span class="referat-kort__top">
            <span class="referat-kort__date">{{ dateLabel(m.date) }}</span>
            <span v-if="openLabel(m)" class="referat-kort__open">{{ openLabel(m) }}</span>
          </span>
          <span class="referat-kort__title">{{ m.title }}</span>
          <span class="referat-kort__lead">{{ m.lead }}</span>
        </router-link>
      </div>
    </section>
  </div>
</template>

<style scoped>
.referater {
  max-width: 680px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.referater__back-wrap { margin-bottom: var(--ds-space-xl); }

.referater__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  letter-spacing: -0.005em;
}

.referater__back svg { width: 14px; height: 14px; }
.referater__back:hover { color: var(--ds-color-text-primary); }

.referater__hero { margin-bottom: var(--ds-space-2xl); }

.referater__eyebrow {
  display: inline-block;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  margin-bottom: var(--ds-space-md);
}

.referater__title {
  font-family: var(--ds-font-display);
  font-size: clamp(2.2rem, 7vw, 3.2rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.05;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0;
}

.block { margin-bottom: var(--ds-space-2xl); }

.block__label {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  margin: 0 0 var(--ds-space-md);
}

/* ---- Ansvar ---- */
.ansvar {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  overflow: hidden;
}

.ansvar__row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  padding: var(--ds-space-md);
  border-top: 1px solid var(--ds-color-border-light);
}

.ansvar__row:first-child { border-top: 0; }

/* Samme avatar-språk som konto-kortet i Admin: aksentsirkel, bildet klippet
   inni. Utklippene er hele figurer, så toppen får styre — ellers krymper
   ansiktet bort i midten av en 40 px sirkel. */
.ansvar__photo,
.ansvar__initial {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-accent-light);
  overflow: hidden;
}

.ansvar__photo {
  object-fit: cover;
  object-position: center top;
}

.ansvar__initial {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-accent);
}

.ansvar__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ansvar__name {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  letter-spacing: var(--ds-tracking-tight);
}

/* Områdene får bryte over flere linjer — Trond har tre, og en ellipsis her
   ville skjult nøyaktig det man kom for å lese. */
.ansvar__areas {
  font-size: var(--ds-text-sm);
  line-height: 1.4;
  color: var(--ds-color-text-secondary);
  letter-spacing: -0.005em;
}

/* ---- Referatliste ---- */
.referat-liste {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.referat-kort {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--ds-space-lg);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out),
    box-shadow var(--ds-duration-fast) var(--ds-ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .referat-kort:hover {
    border-color: var(--ds-color-border-strong);
    box-shadow: var(--ds-shadow-sm);
    transform: translateY(-1px);
  }
}

.referat-kort:active { transform: scale(0.99); }

.referat-kort__top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ds-space-sm);
}

.referat-kort__date {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

.referat-kort__open {
  padding: 2px 8px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-surface);
  border: 1px solid var(--ds-color-border);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
}

.referat-kort__title {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
  line-height: 1.2;
}

.referat-kort__lead {
  font-size: var(--ds-text-sm);
  line-height: 1.45;
  color: var(--ds-color-text-secondary);
  letter-spacing: -0.005em;
}
</style>
