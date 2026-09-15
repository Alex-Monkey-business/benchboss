<script setup>
/**
 * Spilletid for en spilt kamp — lesevisning.
 *
 * Match mode har sin egen ferdig-skjerm med den samme lista, men den ligger
 * bak live-modus og har justeringsmodus innbakt (langtrykk, timeTransfer,
 * check:time). Foreldre går aldri dit. Denne leser bare, og bor på kampen.
 *
 * Tida regnes ut på nytt fra stints — ingen teller, samme kontrakt som
 * useMatchMode. Klokka kommer fra match_sessions; åpne stints (en kamp som
 * aldri ble avsluttet) løper mot den.
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useMatchMode } from '../composables/useMatchMode'
import { usePlayers } from '../composables/usePlayers'

const props = defineProps({
  matchId: { type: String, required: true },
  // player_id → antall mål. Ballen står bare der den betyr noe.
  goalsByPlayer: { type: Object, default: () => ({}) }
})

const { fetchSession, fetchStints } = useMatchMode()
const { getPlayerById } = usePlayers()

const rows = ref([])
const clock = ref(0)
const loaded = ref(false)

async function load(id) {
  if (!id) return
  loaded.value = false
  const [sess, stints] = await Promise.all([fetchSession(id), fetchStints(id)])
  // Klokka er fasit for hvor lang kampen var. Mangler session-raden, er siste
  // avgang det nærmeste vi kommer — ellers blir hver søyle null bred.
  clock.value =
    sess?.clock_base_seconds ||
    (stints || []).reduce((m, s) => Math.max(m, s.off_clock ?? 0), 0)

  const agg = new Map()
  for (const s of stints || []) {
    const end = s.off_clock != null ? s.off_clock : clock.value
    const dur = Math.max(0, end - s.on_clock)
    const e = agg.get(s.player_id) || { id: s.player_id, total: 0, keeper: 0 }
    e.total += dur
    if (s.role === 'keeper') e.keeper += dur
    agg.set(s.player_id, e)
  }
  rows.value = [...agg.values()].map(e => ({
    ...e,
    player: getPlayerById(e.id),
    goals: props.goalsByPlayer[e.id] || 0
  }))
  loaded.value = true
}

onMounted(() => load(props.matchId))
watch(() => props.matchId, load)

// Mest tid først. Lik tid er normaltilstanden når rulleringa har gått opp,
// så navn avgjør — ellers hopper rekkefølgen mellom hver innlasting.
const sorted = computed(() =>
  [...rows.value].sort(
    (a, b) => b.total - a.total || (a.player?.name || '').localeCompare(b.player?.name || '', 'nb')
  )
)

const hasData = computed(() => loaded.value && sorted.value.length > 0)

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function firstName(name) { return (name || '').split(' ')[0] }
function initial(name) { return (firstName(name)[0] || '?').toUpperCase() }
function share(sec) { return clock.value ? Math.round((sec / clock.value) * 100) : 0 }

defineExpose({ hasData })
</script>

<template>
  <div v-if="hasData" class="pt">
    <router-link
      v-for="r in sorted"
      :key="r.id"
      :to="`/spiller/${r.id}`"
      class="pt__row"
      :data-team="r.player?.primary_team || 'none'"
    >
      <span class="pt__avatar" :class="{ 'pt__avatar--gk': r.keeper > 0 }">{{ initial(r.player?.name) }}</span>
      <span class="pt__main">
        <span class="pt__top">
          <span class="pt__name">{{ firstName(r.player?.name) || 'Ukjent' }}</span>
          <span v-if="r.goals" class="pt__goals" :aria-label="`${r.goals} mål`">
            <!-- Fylt ball med lyse sømmer. En tegnet ring med femkant inni ble
                 et øye ved denne størrelsen; silhuetten tåler 15 px. -->
            <svg class="pt__ball" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="currentColor" />
              <path d="M12 7 15.8 9.7 14.3 14.2H9.7L8.2 9.7z" fill="var(--ds-color-bg-elevated)" />
              <path
                d="M12 7V2.2M15.8 9.7l4.6-1.5M14.3 14.2l2.9 3.9M9.7 14.2l-2.9 3.9M8.2 9.7 3.6 8.2"
                stroke="var(--ds-color-bg-elevated)"
                stroke-width="1.5"
              />
            </svg>
            <span v-if="r.goals > 1" class="pt__goalcount">{{ r.goals }}</span>
          </span>
          <span v-if="r.keeper > 0" class="pt__keeper">Keeper</span>
          <span class="pt__time">{{ fmt(r.total) }}</span>
        </span>
        <span class="pt__track">
          <span class="pt__bar" :style="{ width: share(r.total) + '%' }"></span>
        </span>
      </span>
    </router-link>
  </div>
</template>

<style scoped>
.pt {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pt__row {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
}

.pt__avatar {
  flex: none;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--ds-color-bg-sunken);
  color: var(--ds-color-text-secondary);
  font-size: 0.8125rem;
  font-weight: var(--ds-weight-bold);
}

/* Lagfargen er identitet — den følger spilleren, ikke raden.
   Teksten må være `text-inverse`, ikke hvit: i mørkt tema er lagfargene lyse
   (gronn #B5D2B0, rod #EFB99E), og hvit initial på dem forsvant helt. */
.pt__row[data-team="gronn"] .pt__avatar { background: var(--ds-team-gronn); color: var(--ds-color-text-inverse); }
.pt__row[data-team="rod"] .pt__avatar { background: var(--ds-team-rod); color: var(--ds-color-text-inverse); }
.pt__row[data-team="hvit"] .pt__avatar {
  background: var(--ds-team-hvit-bg);
  border: 1px solid var(--ds-team-hvit-border);
  color: var(--ds-color-text-secondary);
}
.pt__avatar--gk {
  background: var(--ds-color-warning) !important;
  border: none !important;
  color: var(--ds-color-text-inverse) !important;
}

.pt__main { flex: 1; min-width: 0; }

.pt__top {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.pt__name {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pt__goals {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
  color: var(--ds-color-text-secondary);
  align-self: center;
}

.pt__ball { width: 15px; height: 15px; display: block; }

.pt__goalcount {
  font-size: 0.75rem;
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
}

.pt__keeper {
  flex: none;
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-tertiary);
}

.pt__time {
  flex: 1;
  text-align: right;
  font-size: 0.875rem;
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-primary);
}

.pt__track {
  display: block;
  height: 4px;
  margin-top: 6px;
  border-radius: 2px;
  background: var(--ds-color-bg-sunken);
  overflow: hidden;
}

.pt__bar {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--ds-color-text-tertiary);
}

.pt__row[data-team="gronn"] .pt__bar { background: var(--ds-team-gronn); }
.pt__row[data-team="rod"] .pt__bar { background: var(--ds-team-rod); }
.pt__row[data-team="hvit"] .pt__bar { background: var(--ds-team-hvit); }
.pt__row:has(.pt__avatar--gk) .pt__bar { background: var(--ds-color-warning); }
</style>
