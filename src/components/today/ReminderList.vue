<script setup>
import { useRouter } from 'vue-router'
import { useDismissedReminders } from '../../composables/useDismissedReminders'

defineProps({
  reminders: { type: Array, required: true }
})

const router = useRouter()
const { dismiss } = useDismissedReminders()

function open(reminder) {
  router.push(`/kamp/${reminder.matchId}`)
}
</script>

<template>
  <div class="reminder-list">
    <div
      v-for="r in reminders"
      :key="r.kind + r.matchId"
      class="reminder-row"
      :class="`reminder-row--${r.tone || 'urgent'}`"
    >
      <button type="button" class="reminder" @click="open(r)">
        <span class="reminder__dot" aria-hidden="true"></span>
        <span class="reminder__body">
          <span class="reminder__title">{{ r.title }}</span>
          <span class="reminder__sub">{{ r.body }}</span>
        </span>
        <svg class="reminder__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button
        v-if="r.dismissable"
        type="button"
        class="reminder__dismiss"
        aria-label="Skjul påminnelse"
        @click="dismiss(r)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.reminder-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

/* Raden er kortet; navigasjon + skjul-knapp ligger inni. */
.reminder-row {
  display: flex;
  align-items: stretch;
  border: 1px solid;
  border-radius: var(--ds-radius-lg);
  overflow: hidden;
  transition:
    transform var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out);
}

.reminder-row:active {
  transform: scale(0.99);
}

/* Tidskritisk: varm, høy vekt. */
.reminder-row--urgent {
  border-color: rgba(185, 96, 63, 0.22);
  background: var(--ds-color-warm-bg);
}

/* Sekundært (referat/utlegg): dempet, nøytral — skriker ikke. */
.reminder-row--soft {
  border-color: var(--ds-color-border-light);
  background: var(--ds-color-bg-elevated);
}

@media (hover: hover) and (pointer: fine) {
  .reminder-row--urgent:hover { border-color: rgba(185, 96, 63, 0.4); }
  .reminder-row--soft:hover { border-color: var(--ds-color-border); }
}

.reminder {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 14px var(--ds-space-md);
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  font-family: var(--ds-font-body);
  -webkit-tap-highlight-color: transparent;
}

.reminder__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.reminder-row--urgent .reminder__dot {
  background: var(--ds-color-warm);
  box-shadow: 0 0 0 4px rgba(185, 96, 63, 0.16);
}

.reminder-row--soft .reminder__dot {
  background: var(--ds-color-text-tertiary);
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

.reminder-row--soft .reminder__title {
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
}

.reminder__sub {
  font-size: var(--ds-text-xs);
  line-height: 1.4;
}

.reminder-row--urgent .reminder__sub { color: var(--ds-color-warm-text); }
.reminder-row--soft .reminder__sub { color: var(--ds-color-text-tertiary); }

.reminder__chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.reminder-row--urgent .reminder__chevron { color: var(--ds-color-warm-text); }
.reminder-row--soft .reminder__chevron { color: var(--ds-color-text-tertiary); }

.reminder__dismiss {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 44px;
  border: none;
  border-left: 1px solid var(--ds-color-border-light);
  background: transparent;
  color: var(--ds-color-text-tertiary);
  cursor: pointer;
  transition: color var(--ds-duration-fast) var(--ds-ease-out), background var(--ds-duration-fast) var(--ds-ease-out);
  -webkit-tap-highlight-color: transparent;
}

.reminder__dismiss svg { width: 16px; height: 16px; }
.reminder__dismiss:active { transform: scale(0.92); }

@media (hover: hover) and (pointer: fine) {
  .reminder__dismiss:hover {
    color: var(--ds-color-text-secondary);
    background: rgba(0, 0, 0, 0.03);
  }
}
</style>
