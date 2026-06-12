<script setup>
import { useRouter } from 'vue-router'

defineProps({
  reminders: { type: Array, required: true }
})

const router = useRouter()

function open(reminder) {
  router.push(`/kamp/${reminder.matchId}`)
}
</script>

<template>
  <div class="reminder-list">
    <button
      v-for="r in reminders"
      :key="r.kind + r.matchId"
      type="button"
      class="reminder"
      @click="open(r)"
    >
      <span class="reminder__dot" aria-hidden="true"></span>
      <span class="reminder__body">
        <span class="reminder__title">{{ r.title }}</span>
        <span class="reminder__sub">{{ r.body }}</span>
      </span>
      <svg class="reminder__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  </div>
</template>

<style scoped>
.reminder-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

/* Samme visuelle språk som .smart-prompt på kamplisten. */
.reminder {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px var(--ds-space-md);
  border: 1px solid rgba(185, 96, 63, 0.22);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-warm-bg);
  text-align: left;
  cursor: pointer;
  font-family: var(--ds-font-body);
  transition:
    transform var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out);
  -webkit-tap-highlight-color: transparent;
}

.reminder:active {
  transform: scale(0.99);
}

@media (hover: hover) and (pointer: fine) {
  .reminder:hover {
    border-color: rgba(185, 96, 63, 0.4);
  }
}

.reminder__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ds-color-warm);
  box-shadow: 0 0 0 4px rgba(185, 96, 63, 0.16);
  flex-shrink: 0;
}

.reminder__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* Full tekst skal alltid være lesbar — bryt linjer, ikke klipp med ellipsis. */
.reminder__title {
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  letter-spacing: -0.005em;
  line-height: 1.35;
}

.reminder__sub {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-warm-text);
  line-height: 1.4;
}

.reminder__chevron {
  width: 16px;
  height: 16px;
  color: var(--ds-color-warm-text);
  flex-shrink: 0;
}
</style>
