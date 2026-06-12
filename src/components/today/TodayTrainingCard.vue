<script setup>
import { computed } from 'vue'

const props = defineProps({
  period: { type: Object, required: true },
  session: { type: Object, required: true }
})

// Samme asset-mønster som TreningsoktView.
const ILLO_BASE = '/illustrations/bench-boss-exercise-illustrations/'
const illoSrc = computed(() => props.session.illustration ? ILLO_BASE + props.session.illustration.replace(/\.png$/, '.webp') : null)
const illoPng = computed(() => props.session.illustration ? ILLO_BASE + props.session.illustration : null)

const drillCount = computed(() => (props.session.drills || []).length)
const drillLabel = computed(() => drillCount.value === 1 ? '1 øvelse' : `${drillCount.value} øvelser`)
</script>

<template>
  <router-link
    :to="`/trening/${period.id}/okt/${session.id}`"
    class="ds-card ds-card--interactive today-training"
    :data-accent="session.accent || 'warm'"
  >
    <div class="today-training__content">
      <span class="today-training__kicker">Trening i dag — dagens fokus</span>
      <p v-if="session.focus" class="today-training__focus">{{ session.focus }}</p>
      <p v-else class="today-training__focus today-training__focus--empty">{{ session.title }}</p>
      <span v-if="drillCount" class="today-training__meta">{{ drillLabel }}</span>
    </div>
    <picture v-if="session.illustration" class="today-training__illo">
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

.today-training__focus {
  margin: 0;
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-xl);
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-primary);
}

.today-training__focus--empty {
  font-size: var(--ds-text-lg);
}

.today-training__meta {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  color: var(--accent-text, var(--ds-color-text-tertiary));
}

.today-training__illo {
  width: 88px;
  flex-shrink: 0;
}

.today-training__illo img {
  width: 100%;
  height: auto;
  display: block;
}

@media (max-width: 380px) {
  .today-training__illo {
    display: none;
  }
}
</style>
