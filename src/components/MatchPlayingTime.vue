<script setup>
/**
 * Spilletid for en spilt kamp — lesevisning, med justering bak ett trykk.
 *
 * Lå før på ferdig-skjermen inne i match mode. Den flata er stengt når kampen
 * er over (du skal ikke kunne havne i klokke-modus igjen), så både lesinga og
 * reparasjonen bor her nå.
 *
 * Tida regnes ut på nytt fra stints — ingen teller, samme kontrakt som
 * useMatchMode. Klokka kommer fra match_sessions; åpne stints (en kamp som
 * aldri ble avsluttet) løper mot den.
 *
 * Justeringen er nullsum: sju står på banen hele kampen, så tid kan bare
 * FLYTTES mellom to spillere, aldri legges til. `lib/timeTransfer.js` finner
 * vinduet; `npm run check:time` er egenskapstesten.
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useMatchMode } from '../composables/useMatchMode'
import { usePlayers } from '../composables/usePlayers'
import { useToast } from '../composables/useToast'

const props = defineProps({
  matchId: { type: String, required: true },
  // player_id → antall mål. Ballen står bare der den betyr noe.
  goalsByPlayer: { type: Object, default: () => ({}) },
  // Låst sesong: les, ikke rør.
  locked: { type: Boolean, default: false }
})

const { fetchSession, fetchStints, stints, adjustPlayingTime, movableSeconds } = useMatchMode()
const { getPlayerById } = usePlayers()
const { show: showToast } = useToast()

const clock = ref(0)
const loaded = ref(false)
// Justeringen regner vinduet mot session-klokka (se movableSeconds). Uten den
// raden er hver overføring 0 sekunder, og chipsene ville stått døde uten at
// noen skjønte hvorfor. Da tilbyr vi dem ikke.
const canAdjust = ref(false)

async function load(id) {
  if (!id) return
  loaded.value = false
  closeAdjust()
  const [sess, rows] = await Promise.all([fetchSession(id), fetchStints(id)])
  // Klokka er fasit for hvor lang kampen var. Mangler session-raden, er siste
  // avgang det nærmeste vi kommer — ellers blir hver søyle null bred.
  clock.value =
    sess?.clock_base_seconds ||
    (rows || []).reduce((m, s) => Math.max(m, s.off_clock ?? 0), 0)
  canAdjust.value = !!sess?.clock_base_seconds
  loaded.value = true
}

onMounted(() => load(props.matchId))
watch(() => props.matchId, load)

// Leses rett fra composablens stints, ikke en kopi: en justering skriver dit,
// og lista skal flytte seg i samme trykk.
const rows = computed(() => {
  const agg = new Map()
  for (const s of stints.value) {
    if (s.match_id !== props.matchId) continue
    const end = s.off_clock != null ? s.off_clock : clock.value
    const dur = Math.max(0, end - s.on_clock)
    const e = agg.get(s.player_id) || { id: s.player_id, total: 0, keeper: 0 }
    e.total += dur
    if (s.role === 'keeper') e.keeper += dur
    agg.set(s.player_id, e)
  }
  // Mest tid først. Lik tid er normaltilstanden når rulleringa har gått opp,
  // så navn avgjør — ellers hopper rekkefølgen mellom hver innlasting.
  return [...agg.values()]
    .map(e => ({ ...e, player: getPlayerById(e.id), goals: props.goalsByPlayer[e.id] || 0 }))
    .sort((a, b) => b.total - a.total || (a.player?.name || '').localeCompare(b.player?.name || '', 'nb'))
})

const hasData = computed(() => loaded.value && rows.value.length > 0)

// ── Justering ───────────────────────────────────────────────────────────────
const adjusting = ref(false)
const giver = ref(null)
const taker = ref(null)

function openAdjust() {
  adjusting.value = true
  giver.value = null
  taker.value = null
}
function closeAdjust() {
  adjusting.value = false
  giver.value = null
  taker.value = null
}

// Første trykk velger den som gir, andre den som får. Trykk på en valgt
// spiller angrer valget — ingen egen «fjern»-knapp for noe så lite.
function pickRow(id) {
  if (giver.value === id) { giver.value = taker.value; taker.value = null; return }
  if (taker.value === id) { taker.value = null; return }
  if (!giver.value) giver.value = id
  else if (!taker.value) taker.value = id
  else { giver.value = id; taker.value = null }
}

const movable = computed(() =>
  giver.value && taker.value ? movableSeconds(props.matchId, giver.value, taker.value) : 0
)

async function moveTime(seconds) {
  const from = giver.value
  const to = taker.value
  const res = await adjustPlayingTime(props.matchId, from, to, seconds)
  if (!res.moved) {
    showToast(`${firstName(playerName(to))} sto allerede på banen`, 'error')
    return
  }
  const partial = res.moved < seconds ? ' (så mye det var plass til)' : ''
  showToast(`${fmt(res.moved)} fra ${firstName(playerName(from))} til ${firstName(playerName(to))}${partial}`, 'success')
}

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function playerName(id) { return getPlayerById(id)?.name || '' }
function firstName(name) { return (name || '').split(' ')[0] }
function initial(name) { return (firstName(name)[0] || '?').toUpperCase() }
function share(sec) { return clock.value ? Math.round((sec / clock.value) * 100) : 0 }
</script>

<template>
  <div v-if="hasData" class="pt">
    <div class="pt__list">
      <component
        :is="adjusting ? 'button' : 'router-link'"
        v-for="r in rows"
        :key="r.id"
        v-bind="adjusting ? { type: 'button' } : { to: `/spiller/${r.id}` }"
        class="pt__row"
        :class="{
          'pt__row--giver': giver === r.id,
          'pt__row--taker': taker === r.id,
          'pt__row--dim': adjusting && giver && taker && giver !== r.id && taker !== r.id
        }"
        :data-team="r.player?.primary_team || 'none'"
        @click="adjusting && pickRow(r.id)"
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
      </component>
    </div>

    <!-- Justering: nullsum, så det er alltid ett bytte — A går av, B står de
         sekundene A ikke lenger står. Aldri «legg til tid». -->
    <div v-if="adjusting" class="adj">
      <p v-if="!giver" class="adj__hint">Velg hvem som skal gi tid.</p>
      <p v-else-if="!taker" class="adj__hint">Og hvem som skal få den.</p>
      <template v-else>
        <p class="adj__pair">
          {{ firstName(playerName(giver)) }} <span class="adj__arrow">→</span> {{ firstName(playerName(taker)) }}
        </p>
        <div class="adj__chips">
          <button
            v-for="m in [1, 2, 3, 5]"
            :key="m"
            type="button"
            class="adj__chip"
            :disabled="movable < 60"
            @click="moveTime(m * 60)"
          >{{ m }} min</button>
        </div>
        <p v-if="movable < 60" class="adj__hint adj__hint--warn">
          {{ firstName(playerName(taker)) }} sto på banen hele tida {{ firstName(playerName(giver)) }} sto.
          Ingen tid å flytte.
        </p>
      </template>
      <div class="adj__foot">
        <button type="button" class="adj__link" @click="closeAdjust">Ferdig</button>
      </div>
    </div>

    <div v-else-if="!locked && canAdjust" class="pt__foot">
      <button type="button" class="adj__link" @click="openAdjust">Juster spilletid</button>
    </div>
  </div>
</template>

<style scoped>
.pt {
  display: flex;
  flex-direction: column;
}

.pt__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pt__row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  font: inherit;
  text-decoration: none;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.15s ease;
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

/* Valgt i justering: rollen står som ORD ved navnet, ikke som en farge det
   må huskes hva betyr. Lagfargen i avataren er fortsatt det sterkeste i raden. */
.pt__row--giver .pt__name::after { content: 'gir'; }
.pt__row--taker .pt__name::after { content: 'får'; }
.pt__row--giver .pt__name::after,
.pt__row--taker .pt__name::after {
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: var(--ds-radius-full);
  font-size: 10px;
  font-weight: var(--ds-weight-bold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid var(--ds-color-border);
  color: var(--ds-color-text-tertiary);
  background: var(--ds-color-bg-elevated);
}
.pt__row--dim { opacity: 0.4; }

.pt__foot {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.adj {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--ds-color-border-light);
}

.adj__hint {
  margin: 0 0 10px;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.adj__hint--warn { color: var(--ds-color-warm-text, var(--ds-color-text-tertiary)); }

.adj__pair {
  margin: 0 0 10px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

.adj__arrow { color: var(--ds-color-text-tertiary); padding: 0 2px; }

.adj__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Full bredde per chip: dette trykkes med tommelen på en telefon, ofte med
   kalde fingre på en sidelinje. */
.adj__chip {
  flex: 1;
  padding: 14px 0;
  border: 1.5px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.adj__chip:disabled {
  opacity: 0.45;
  cursor: default;
}

.adj__foot {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}

.adj__link {
  padding: 0;
  border: none;
  background: none;
  font-family: var(--ds-font-body);
  font-size: 0.8125rem;
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
  border-bottom: 1px solid var(--ds-color-border);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
</style>
