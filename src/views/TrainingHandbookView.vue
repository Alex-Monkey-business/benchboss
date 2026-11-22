<script setup>
import Ikon from '../components/Ikon.vue'
import Spot from '../components/Spot.vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useContent } from '../composables/useContent'
import BackLink from '../components/BackLink.vue'

const router = useRouter()
const { activeCohort } = useAuth()
const { principles, hasHandbook, handbokOpphav } = useContent()
const cohortName = computed(() => activeCohort.value?.name || 'oss')
const klubbNavn = computed(() => activeCohort.value?.club_short_name || activeCohort.value?.club_name || 'klubben')

function open(slug) {
  router.push(`/trening/handbok/${slug}`)
}
</script>

<template>
  <div class="handbook">
    <div class="handbook__back-wrap">
      <BackLink to="/trening" label="Trening" />
    </div>

    <header class="handbook__hero">
      <Spot name="book" class="handbook__icon" :size="104" />
      <span class="handbook__eyebrow">Trenerhåndbok</span>
      <h1 class="handbook__title">{{ handbokOpphav ? `Slik trener vi i ${klubbNavn}` : `Slik trener vi ${cohortName}` }}</h1>
      <!-- Håndboka er klubbens, men den er skrevet av noen. Uten avsenderen
           leser et nytt kull prinsippene som appens egne, og da er de ingens. -->
      <p v-if="handbokOpphav" class="handbook__opphav">
        Skrevet av {{ handbokOpphav }} · gjelder alle kull i {{ klubbNavn }}
      </p>
    </header>

    <div v-if="!hasHandbook" class="handbook__list">
      <p class="handbook__empty">{{ klubbNavn }} har ingen håndbok ennå.</p>
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
        <Ikon navn="pil-hoyre" class="handbook-card__chevron" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.handbook__opphav {
  margin: var(--ds-space-12) 0 0;
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
}

.handbook__empty {
  margin: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

/* Per-accent palette for cards — matches coach color tokens */

.handbook {
  max-width: var(--ds-content-max);
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.handbook__back-wrap {
  margin-bottom: var(--ds-space-xl);
}




/* ---- Hero ---- */
.handbook__hero {
  margin-bottom: var(--ds-space-2xl);
}

.handbook__icon {
  --spot-size: 104px;
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
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-2xl);
  font-weight: var(--ds-weight-black);
  letter-spacing: var(--ds-tracking-tight);
  line-height: var(--ds-leading-tight);
  color: var(--ds-color-text-primary);
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
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  /* Flush innenfor kortets 1 px ramme: kortets hjørne minus rammen, så
     de to buene er konsentriske. */
  border-radius: calc(var(--ds-radius-lg) - 1px) 0 0 calc(var(--ds-radius-lg) - 1px);
  margin: calc(var(--ds-space-md) * -1) 0;
}

.handbook-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  min-width: 0;
  padding-top: var(--ds-space-2xs);
}

.handbook-card__title {
  font-family: var(--ds-font-heading);
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
@keyframes handbook-card-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .handbook-card { animation: none; opacity: 1; }
}
</style>
