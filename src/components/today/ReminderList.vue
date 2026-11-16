<script setup>
import { useRouter } from 'vue-router'
import { useDismissedReminders } from '../../composables/useDismissedReminders'
import { meldEvent } from '../../lib/sporing'

defineProps({
  reminders: { type: Array, required: true }
})

const router = useRouter()
const { dismiss } = useDismissedReminders()

// Måler om «Å ordne»-logikken treffer: hvilke korttyper folk faktisk handler
// på, og hvilke de skyver bort. Bare `kind` sendes — ingen kamp-id, ingen navn.
function open(reminder) {
  meldEvent('hjemkort_trykket', { kind: reminder.kind })
  router.push(reminder.to || `/kamp/${reminder.matchId}`)
}

function skjul(reminder) {
  meldEvent('hjemkort_avvist', { kind: reminder.kind })
  dismiss(reminder)
}
</script>

<template>
  <div class="ds-rows">
    <div
      v-for="r in reminders"
      :key="r.key || r.kind + r.matchId"
      class="ds-row reminder-row"
      :class="`reminder-row--${r.tone || 'urgent'}`"
    >
      <button type="button" class="reminder" @click="open(r)">
        <span class="reminder__dot" aria-hidden="true"></span>
        <span class="ds-row__body">
          <span class="ds-row__title reminder__title">{{ r.title }}</span>
          <span class="ds-row__sub reminder__sub">{{ r.body }}</span>
        </span>
      </button>
      <button
        v-if="r.dismissable"
        type="button"
        class="reminder__dismiss"
        aria-label="Skjul påminnelse"
        @click="skjul(r)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Radformen bor i designsystemet (.ds-row). Her: raden er beholderen, og
   navigasjon + skjul-knapp ligger inni — derfor ingen padding på selve raden. */
.reminder-row {
  align-items: stretch;
  gap: 0;
  padding: 0;
  overflow: hidden;
}

.reminder-row:has(.reminder:active) {
  transform: scale(0.99);
}

/* Tidskritisk: varm, høy vekt. */
.reminder-row--urgent {
  border-color: color-mix(in srgb, var(--ds-color-warm) 24%, transparent);
  background: var(--ds-color-warm-bg);
  box-shadow: none;
}

/* Sekundært (referat/utlegg): dempet, nøytral — skriker ikke. */
.reminder-row--soft {
  border-color: var(--ds-color-border-light);
}

@media (hover: hover) and (pointer: fine) {
  .reminder-row--urgent:hover { border-color: color-mix(in srgb, var(--ds-color-warm) 45%, transparent); }
  .reminder-row--soft:hover { border-color: var(--ds-color-border); }
}

.reminder {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px var(--ds-space-md);
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  font-family: var(--ds-font-body);
  color: inherit;
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
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ds-color-warm) 18%, transparent);
}

.reminder-row--soft .reminder__dot {
  background: var(--ds-color-text-tertiary);
}

.reminder-row--soft .reminder__title {
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
}

.reminder-row--urgent .reminder__sub { color: var(--ds-color-warm-text); }

/* Ingen chevron: hele kortet er trykkflata, og på radene som kan skjules
   sto chevron og kryss side om side — to handlinger på én rad. */

.reminder__dismiss {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 48px;
  border: none;
  background: transparent;
  color: var(--ds-color-text-tertiary);
  cursor: pointer;
  transition: color var(--ds-duration-fast) var(--ds-ease-out), background var(--ds-duration-fast) var(--ds-ease-out);
  -webkit-tap-highlight-color: transparent;
}

.reminder__dismiss svg { width: 18px; height: 18px; }
.reminder__dismiss:active { transform: scale(0.92); }

@media (hover: hover) and (pointer: fine) {
  .reminder__dismiss:hover {
    color: var(--ds-color-text-secondary);
    background: color-mix(in srgb, var(--ds-color-text-primary) 5%, transparent);
  }
}
</style>
