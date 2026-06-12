<script setup>
import { computed } from 'vue'
import { relativeDateLabel } from '../../lib/dateLabels'

const props = defineProps({
  period: { type: Object, required: true },
  session: { type: Object, required: true },
  date: { type: String, required: true }
})

// Samme asset-mønster som TreningsoktView.
const ILLO_BASE = '/illustrations/bench-boss-exercise-illustrations/'
const illoSrc = computed(() => props.session.illustration ? ILLO_BASE + props.session.illustration.replace(/\.png$/, '.webp') : null)
const illoPng = computed(() => props.session.illustration ? ILLO_BASE + props.session.illustration : null)

const when = computed(() => relativeDateLabel(props.date))
const drills = computed(() => (props.session.drills || []).map(d => d.text).filter(Boolean))
</script>

<template>
  <router-link
    :to="`/trening/${period.id}/okt/${session.id}`"
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
      <picture v-if="session.illustration" class="next-training__illo">
        <source :srcset="illoSrc" type="image/webp" />
        <img :src="illoPng" alt="" loading="lazy" />
      </picture>
    </div>

    <ul v-if="drills.length" class="next-training__drills">
      <li v-for="drill in drills" :key="drill">{{ drill }}</li>
    </ul>
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

.next-training__focus {
  margin: 0;
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-xl);
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-primary);
}

.next-training__illo {
  width: 96px;
  flex-shrink: 0;
}

.next-training__illo img {
  width: 100%;
  height: auto;
  display: block;
}

@media (max-width: 380px) {
  .next-training__illo {
    display: none;
  }
}

.next-training__drills {
  list-style: none;
  margin: 0;
  padding: var(--ds-space-sm) 0 0;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.next-training__drills li {
  position: relative;
  padding-left: 14px;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.next-training__drills li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.55em;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-text);
}
</style>
