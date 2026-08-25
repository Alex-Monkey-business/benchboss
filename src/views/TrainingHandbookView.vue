<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useContent } from '../composables/useContent'

const router = useRouter()
const { activeCohort } = useAuth()
const { principles, hasHandbook } = useContent()
const cohortName = computed(() => activeCohort.value?.name || 'oss')

function open(slug) {
  router.push(`/trening/handbok/${slug}`)
}
</script>

<template>
  <div class="handbook">
    <div class="handbook__back-wrap">
      <router-link to="/trening" class="handbook__back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Trening
      </router-link>
    </div>

    <header class="handbook__hero">
      <img class="handbook__icon" src="/illustrations/bench-boss-feature-icons/512/training-handbook-transparent.png" alt="" />
      <span class="handbook__eyebrow">Trener-håndbok</span>
      <h1 class="handbook__title">Slik trener vi {{ cohortName }}</h1>
      <p v-if="hasHandbook" class="handbook__lead">
        Åtte prinsipper som gjør at alle 24 utvikler seg —
        ikke bare de elleve som allerede er fremme.
      </p>
    </header>

    <div v-if="!hasHandbook" class="handbook__list">
      <p class="handbook__empty">Håndboka for {{ cohortName }} er ikke skrevet ennå.</p>
    </div>

    <div v-else class="handbook__list">
      <button
        v-for="(p, i) in principles"
        :key="p.slug"
        type="button"
        :data-accent="p.accent"
        class="handbook-card"
        :style="{ '--card-delay': `${i * 60}ms` }"
        @click="open(p.slug)"
      >
        <span class="handbook-card__number">{{ String(p.number).padStart(2, '0') }}</span>
        <span class="handbook-card__body">
          <span class="handbook-card__title">{{ p.title }}</span>
          <span class="handbook-card__lead">{{ p.lead }}</span>
        </span>
        <svg class="handbook-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>

    <footer v-if="hasHandbook" class="handbook__footer">
      <p>Skrevet for oss fem, basert på det vi har lært. Endrer seg etter hvert som vi gjør det.</p>
    </footer>
  </div>
</template>

<style scoped>
.handbook__empty {
  margin: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

/* Per-accent palette for cards — matches coach color tokens */
.handbook-card[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.handbook-card[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.handbook-card[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.handbook-card[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.handbook-card[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
.handbook-card[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }

:global([data-theme="dark"] .handbook-card[data-accent="warm"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .handbook-card[data-accent="sage"]) { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"] .handbook-card[data-accent="cornflower"]) { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"] .handbook-card[data-accent="peach"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] .handbook-card[data-accent="sky"]) { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"] .handbook-card[data-accent="olive"]) { --accent-bg: #2A241A; --accent-text: #D9C99E; }

.handbook {
  max-width: 680px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.handbook__back-wrap {
  margin-bottom: var(--ds-space-xl);
}

.handbook__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  letter-spacing: -0.005em;
}

.handbook__back svg {
  width: 14px;
  height: 14px;
}

.handbook__back:hover {
  color: var(--ds-color-text-primary);
}

/* ---- Hero ---- */
.handbook__hero {
  margin-bottom: var(--ds-space-2xl);
}

.handbook__icon {
  width: 104px;
  height: auto;
  display: block;
  margin-bottom: var(--ds-space-md);
}

.handbook__eyebrow {
  display: inline-block;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  margin-bottom: var(--ds-space-md);
}

.handbook__title {
  font-family: var(--ds-font-display);
  font-size: clamp(2.2rem, 7vw, 3.2rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.05;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0 0 var(--ds-space-lg);
}

.handbook__lead {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-regular);
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-secondary);
  max-width: 32ch;
  margin: 0;
}

/* ---- List of cards ---- */
.handbook__list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-2xl);
}

.handbook-card {
  display: flex;
  align-items: stretch;
  gap: var(--ds-space-md);
  padding: var(--ds-space-md) var(--ds-space-md) var(--ds-space-md) 0;
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  cursor: pointer;
  text-align: left;
  font-family: var(--ds-font-body);
  -webkit-tap-highlight-color: transparent;
  transition:
    transform var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out),
    box-shadow var(--ds-duration-fast) var(--ds-ease-out);
  opacity: 0;
  animation: handbook-card-in 450ms var(--ds-ease-smooth) both;
  animation-delay: var(--card-delay);
}

@media (hover: hover) and (pointer: fine) {
  .handbook-card:hover {
    border-color: var(--ds-color-border-strong);
    box-shadow: var(--ds-shadow-sm);
    transform: translateY(-1px);
  }
}

.handbook-card:active {
  transform: scale(0.99);
}

.handbook-card__number {
  flex-shrink: 0;
  width: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-bg);
  color: var(--accent-text);
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  font-variation-settings: var(--ds-font-display-settings);
  border-radius: var(--ds-radius-md) 0 0 var(--ds-radius-md);
  margin: calc(var(--ds-space-md) * -1) 0;
}

.handbook-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding-top: 2px;
}

.handbook-card__title {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
  line-height: 1.2;
}

.handbook-card__lead {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  line-height: 1.45;
  letter-spacing: -0.005em;
}

.handbook-card__chevron {
  width: 16px;
  height: 16px;
  align-self: center;
  color: var(--ds-color-text-tertiary);
  flex-shrink: 0;
}

/* ---- Footer ---- */
.handbook__footer {
  padding-top: var(--ds-space-xl);
  border-top: 1px solid var(--ds-color-border-light);
}

.handbook__footer p {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
  font-style: italic;
  margin: 0;
  letter-spacing: -0.005em;
}

@keyframes handbook-card-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .handbook-card { animation: none; opacity: 1; }
}
</style>
