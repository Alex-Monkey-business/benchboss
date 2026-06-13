<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { principles, findPrinciple } from '../content/principles'

const route = useRoute()
const router = useRouter()

const principle = computed(() => findPrinciple(route.params.slug))
const index = computed(() => principles.findIndex(p => p.slug === route.params.slug))
const next = computed(() => principles[index.value + 1] || null)
const prev = computed(() => principles[index.value - 1] || null)

function goTo(slug) {
  router.push(`/trening/handbok/${slug}`)
}
</script>

<template>
  <div v-if="principle" class="principle" :data-accent="principle.accent">
    <div class="principle__nav">
      <router-link to="/trening/handbok" class="principle__back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Håndboken
      </router-link>
      <span class="principle__pos">{{ principle.number }} av {{ principles.length }}</span>
    </div>

    <article class="principle__article">
      <span class="principle__number">{{ String(principle.number).padStart(2, '0') }}</span>
      <h1 class="principle__title">{{ principle.title }}</h1>
      <p class="principle__lead">{{ principle.lead }}</p>

      <div v-for="(section, i) in principle.sections" :key="i" class="principle__section">
        <h2 class="principle__heading">{{ section.heading }}</h2>
        <p v-if="section.body" class="principle__body">{{ section.body }}</p>
        <ul v-if="section.items" class="principle__list">
          <li v-for="(item, j) in section.items" :key="j">{{ item }}</li>
        </ul>
      </div>

      <blockquote v-if="principle.quote" class="principle__quote">
        {{ principle.quote }}
      </blockquote>
    </article>

    <nav class="principle__pager">
      <button v-if="prev" type="button" class="principle__pager-btn" @click="goTo(prev.slug)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        <span class="principle__pager-meta">
          <span class="principle__pager-label">Forrige</span>
          <span class="principle__pager-title">{{ prev.title }}</span>
        </span>
      </button>
      <span v-else></span>

      <button v-if="next" type="button" class="principle__pager-btn principle__pager-btn--next" @click="goTo(next.slug)">
        <span class="principle__pager-meta principle__pager-meta--right">
          <span class="principle__pager-label">Neste</span>
          <span class="principle__pager-title">{{ next.title }}</span>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <span v-else></span>
    </nav>
  </div>
</template>

<style scoped>
.principle[data-accent="warm"]       { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.principle[data-accent="sage"]       { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
.principle[data-accent="cornflower"] { --accent-bg: #D6DDEF; --accent-text: #3D456B; }
.principle[data-accent="peach"]      { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
.principle[data-accent="sky"]        { --accent-bg: #DDE6EC; --accent-text: #3A4C5C; }
.principle[data-accent="olive"]      { --accent-bg: #F0E7D6; --accent-text: #6B5630; }

:global([data-theme="dark"]) .principle[data-accent="warm"]       { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"]) .principle[data-accent="sage"]       { --accent-bg: #1A241D; --accent-text: #B5D2B0; }
:global([data-theme="dark"]) .principle[data-accent="cornflower"] { --accent-bg: #1A1F33; --accent-text: #B9C2E5; }
:global([data-theme="dark"]) .principle[data-accent="peach"]      { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"]) .principle[data-accent="sky"]        { --accent-bg: #1A222A; --accent-text: #B0C5D8; }
:global([data-theme="dark"]) .principle[data-accent="olive"]      { --accent-bg: #2A241A; --accent-text: #D9C99E; }

.principle {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.principle__nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--ds-space-2xl);
}

.principle__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  letter-spacing: -0.005em;
}

.principle__back svg { width: 14px; height: 14px; }

.principle__back:hover { color: var(--ds-color-text-primary); }

.principle__pos {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

/* ---- Article ---- */
.principle__article {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-lg);
}

.principle__number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  background: var(--accent-bg);
  color: var(--accent-text);
  border-radius: var(--ds-radius-lg);
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-2xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  font-variation-settings: var(--ds-font-display-settings);
  margin-bottom: var(--ds-space-sm);
}

.principle__title {
  font-family: var(--ds-font-display);
  font-size: clamp(2rem, 6.5vw, 2.8rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.1;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0;
}

.principle__lead {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-regular);
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-primary);
  margin: 0;
}

.principle__section {
  margin-top: var(--ds-space-md);
}

.principle__heading {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--accent-text);
  margin: 0 0 var(--ds-space-sm);
}

.principle__body {
  font-size: var(--ds-text-md);
  line-height: 1.6;
  color: var(--ds-color-text-secondary);
  margin: 0;
  letter-spacing: -0.005em;
}

.principle__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.principle__list li {
  position: relative;
  padding-left: var(--ds-space-lg);
  font-size: var(--ds-text-md);
  line-height: 1.5;
  color: var(--ds-color-text-secondary);
  letter-spacing: -0.005em;
}

.principle__list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.65em;
  width: 14px;
  height: 1px;
  background: var(--accent-text);
}

.principle__quote {
  margin: var(--ds-space-xl) 0 0;
  padding: var(--ds-space-lg) var(--ds-space-xl);
  background: var(--accent-bg);
  color: var(--accent-text);
  border-radius: var(--ds-radius-lg);
  font-family: var(--ds-font-display);
  font-style: italic;
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-regular);
  line-height: 1.4;
  letter-spacing: -0.01em;
}

/* ---- Pager ---- */
.principle__pager {
  display: flex;
  justify-content: space-between;
  gap: var(--ds-space-md);
  margin-top: var(--ds-space-2xl);
  padding-top: var(--ds-space-xl);
  border-top: 1px solid var(--ds-color-border-light);
}

.principle__pager-btn {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  background: transparent;
  border: 0;
  padding: 4px;
  cursor: pointer;
  font-family: var(--ds-font-body);
  color: var(--ds-color-text-secondary);
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  transition: color var(--ds-duration-fast) var(--ds-ease-out);
}

.principle__pager-btn:hover { color: var(--ds-color-text-primary); }

.principle__pager-btn:active { transform: scale(0.98); }

.principle__pager-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.principle__pager-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.principle__pager-meta--right {
  text-align: right;
}

.principle__pager-label {
  font-size: var(--ds-text-xs);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

.principle__pager-title {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  letter-spacing: -0.005em;
}
</style>
