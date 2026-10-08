<script setup>
// ØKTA — treninga slik den kjøres på feltet, ikke slik den leses.
//
// To skjermer. Først «Hvem er her?»: hele kullet og alle trenerne er på,
// trykk bort dem som mangler, «Start økta». Så økta: øvelsene langs klokka,
// hver med gruppene ferdig fordelt og trenerne satt på. Riggen står på
// treningsdagen, ikke her — den er gjort før noen vet hvor mange som kommer.
//
// Hvordan en øvelse gjennomføres, hva du ser etter og hva du roper, ligger
// bak «Om øvelsen». Det leser du i ro og mak. Her er det organiseringen som
// er jobben — den er det som endrer seg fra gang til gang.
//
// Oppmøtet er delt: trykker Trond bort en spiller, forsvinner hun fra
// gruppene på din telefon også. Gruppene lagres ikke; de regnes likt på hver
// telefon av oppmøtet, nivåene og øvelsen, pluss trenernes inngrep.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTrainingWeek } from '../composables/useTrainingWeek'
import { useExercises, resolveDrills } from '../composables/useExercises'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerLevels } from '../composables/usePlayerLevels'
import { useCoaches } from '../composables/useCoaches'
import { useTreningsOkt, datoFor } from '../composables/useTreningsOkt'
import { useAuth } from '../stores/auth'
import { grupperFor, ovelseNokkel, fordelTrenere, kortnavn } from '../lib/grupper'
import { weekdayDateLabel } from '../lib/dateLabels'
import { meldEvent } from '../lib/sporing'
import TreningsGrupper from '../components/TreningsGrupper.vue'
import ExerciseView from '../components/ExerciseView.vue'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const { isCoach } = useAuth()
const { days, fetchWeek } = useTrainingWeek()
const { exercises, fetchExercises } = useExercises()
const { players, fetchPlayers } = usePlayers()
const { fetchPlayerLevels, levelFor } = usePlayerLevels()
const { coaches, fetchCoaches } = useCoaches()
const okt = useTreningsOkt()
const run = okt.run

const session = computed(() => days.value.find(s => s.id === route.params.id) || null)
const drills = computed(() => (session.value ? resolveDrills(session.value.drills, exercises.value) : []))
const dato = computed(() => (session.value ? datoFor(session.value) : ''))

const sortert = computed(() => [...players.value].sort((a, b) => a.name.localeCompare(b.name, 'no')))
const navn = computed(() => kortnavn(players.value))
const trenerNavn = computed(() => kortnavn(coaches.value))

// ── Hvem er her? ────────────────────────────────────────────────────────────
//
// Før økta er startet er dette et utkast på telefonen: alle er på, du trykker
// bort. Etter start skriver hvert trykk rett til økta.
const borteSpillere = ref(new Set())
const borteTrenere = ref(new Set())
const redigerer = ref(false)
const fase = computed(() => (!run.value || redigerer.value ? 'oppmote' : 'okt'))

function erHer(id) {
  return run.value ? run.value.spillere.includes(id) : !borteSpillere.value.has(id)
}
function trenerHer(id) {
  return run.value ? run.value.trenere.includes(id) : !borteTrenere.value.has(id)
}
const antallHer = computed(() => players.value.filter(p => erHer(p.id)).length)
const trenereHer = computed(() => coaches.value.filter(c => trenerHer(c.id)).length)

function vekslSpiller(id) {
  if (run.value) return okt.settSpiller(id, !erHer(id))
  const s = new Set(borteSpillere.value)
  s.has(id) ? s.delete(id) : s.add(id)
  borteSpillere.value = s
}
function vekslTrener(id) {
  if (run.value) return okt.settTrener(id, !trenerHer(id))
  const s = new Set(borteTrenere.value)
  s.has(id) ? s.delete(id) : s.add(id)
  borteTrenere.value = s
}

const starter = ref(false)
async function start() {
  if (starter.value || !session.value) return
  starter.value = true
  const sp = players.value.filter(p => !borteSpillere.value.has(p.id)).map(p => p.id)
  const tr = coaches.value.filter(c => !borteTrenere.value.has(c.id)).map(c => c.id)
  await okt.start(session.value, sp, tr)
  meldEvent('okt_startet', { spillere: sp.length, trenere: tr.length })
  starter.value = false
  window.scrollTo({ top: 0 })
}

// ── Økta ────────────────────────────────────────────────────────────────────
const tilStede = computed(() =>
  run.value
    ? players.value.filter(p => run.value.spillere.includes(p.id)).map(p => ({ id: p.id, niva: levelFor(p.id) }))
    : []
)
const trenereIOkta = computed(() =>
  run.value ? coaches.value.filter(c => run.value.trenere.includes(c.id)).map(c => trenerNavn.value[c.id]) : []
)

// Klokka: økta begynner når den startes, og hver øvelse har sin lengde.
const na = ref(Date.now())
let tikk = null
const tider = computed(() => {
  if (!run.value) return []
  let t = new Date(run.value.started_at).getTime()
  return drills.value.map(d => {
    const fra = t
    const til = d.minutes ? t + d.minutes * 60000 : null
    if (til) t = til
    return { fra, til }
  })
})
function klokke(ms) {
  return new Date(ms).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
}
const naIndeks = computed(() => tider.value.findIndex(x => x.til && na.value >= x.fra && na.value < x.til))

// Kortene: gruppene per øvelse, og trenerne på dem. Trenerne står på samme
// plass hele økta; rotasjonen skjer fra trening til trening (_runde).
const kort = computed(() => {
  const runde = run.value?.state?._runde || 0
  return drills.value.map((d, i) => {
    const nokkel = ovelseNokkel(i, d)
    const plan = grupperFor(d, i, tilStede.value, run.value?.state?.[nokkel] || {})
    const trenere = plan ? fordelTrenere(plan.antall, trenereIOkta.value, runde) : []
    const tid = tider.value[i]
    return {
      d, i, nokkel, plan, trenere,
      tid: tid?.til ? `${klokke(tid.fra)}–${klokke(tid.til)}` : '',
      na: i === naIndeks.value,
      ferdig: tid?.til ? na.value >= tid.til : false
    }
  })
})

// Ett kort åpent om gangen: det klokka står på, ellers det første som deles.
const apent = ref(null)
watch(() => run.value?.id, id => {
  // Klokka må vite at økta nettopp startet, ellers står «Nå» tomt i et halvt minutt.
  na.value = Date.now()
  if (!id || apent.value != null) return
  const k = kort.value.find(x => x.na && x.plan) || kort.value.find(x => x.plan)
  apent.value = k ? k.i : null
}, { immediate: true })

function inngrep(k) { return run.value?.state?.[k.nokkel] || {} }
function bytt(k, a, b) {
  const cur = inngrep(k)
  okt.settInngrep(k.nokkel, { ...cur, bytter: [...(cur.bytter || []), [a, b]] })
}
function settAntall(k, n) {
  const cur = inngrep(k)
  // Byttene var gjort i en annen fordeling og gir ikke mening i den nye.
  okt.settInngrep(k.nokkel, { ...cur, antall: n === k.plan.foreslatt ? null : n, bytter: [] })
}
function bland(k) {
  const cur = inngrep(k)
  okt.settInngrep(k.nokkel, { ...cur, seed: (cur.seed || 1) + 1, bytter: [] })
}

// Om øvelsen — innholdet, for den som vil lese.
const omOvelse = ref(null)

const visSlett = ref(false)
async function slett() {
  visSlett.value = false
  redigerer.value = false
  await okt.slett()
}

let stopp = null
watch(session, s => {
  if (s && !stopp) stopp = okt.folg(s)
}, { immediate: true })

onMounted(() => {
  fetchWeek()
  fetchExercises()
  fetchPlayers()
  fetchPlayerLevels()
  fetchCoaches()
  tikk = setInterval(() => { na.value = Date.now() }, 30000)
})
onUnmounted(() => {
  stopp?.()
  clearInterval(tikk)
})
</script>

<template>
  <div class="okt">
    <div class="okt__bar">
      <button class="okt__back" aria-label="Tilbake" @click="fase === 'oppmote' && run ? (redigerer = false) : router.push({ path: '/trening', query: session ? { dag: session.id } : {} })">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="okt__title">{{ session?.title || 'Trening' }}<span v-if="dato" class="okt__dato"> · {{ weekdayDateLabel(dato).replace(/^\S+\s/, '') }}</span></span>
      <button v-if="fase === 'okt'" type="button" class="okt__lenke" @click="redigerer = true">Oppmøte</button>
    </div>

    <p v-if="!isCoach" class="okt__tom">Økta er for trenerne.</p>
    <p v-else-if="!session || !okt.lastet.value" class="okt__tom">Laster …</p>

    <!-- ── HVEM ER HER? ─────────────────────────────────────────── -->
    <div v-else-if="fase === 'oppmote'" class="oppm">
      <div class="oppm__hode">
        <h1 class="okt__h1">Hvem er her?</h1>
        <p class="oppm__teller"><strong>{{ antallHer }}</strong> av {{ players.length }}</p>
      </div>
      <p class="oppm__hjelp">Trykk bort dem som ikke kom.<template v-if="run"> Endringer deles med de andre trenerne med en gang.</template></p>

      <div class="oppm__grid">
        <button
          v-for="p in sortert"
          :key="p.id"
          type="button"
          class="oppm__navn"
          :class="{ 'oppm__navn--borte': !erHer(p.id) }"
          :aria-pressed="erHer(p.id) ? 'true' : 'false'"
          @click="vekslSpiller(p.id)"
        >{{ navn[p.id] }}</button>
      </div>

      <template v-if="coaches.length">
        <div class="oppm__hode oppm__hode--trenere">
          <h2 class="oppm__h2">Trenere</h2>
          <p class="oppm__teller"><strong>{{ trenereHer }}</strong> av {{ coaches.length }}</p>
        </div>
        <div class="oppm__grid">
          <button
            v-for="c in coaches"
            :key="c.id"
            type="button"
            class="oppm__navn"
            :class="{ 'oppm__navn--borte': !trenerHer(c.id) }"
            :aria-pressed="trenerHer(c.id) ? 'true' : 'false'"
            @click="vekslTrener(c.id)"
          >{{ trenerNavn[c.id] }}</button>
        </div>
      </template>

      <div class="oppm__fot">
        <button v-if="!run" type="button" class="okt__start" :disabled="!antallHer || starter" @click="start">
          Start økta med {{ antallHer }}
        </button>
        <template v-else>
          <button type="button" class="okt__start" @click="redigerer = false">Ferdig</button>
          <button type="button" class="okt__slett" @click="visSlett = true">Slett økta</button>
        </template>
      </div>
    </div>

    <!-- ── ØKTA ─────────────────────────────────────────────────── -->
    <div v-else class="okt__wrap">
      <p class="okt__sum">
        <strong>{{ tilStede.length }}</strong> spillere · <strong>{{ trenereIOkta.length }}</strong> {{ trenereIOkta.length === 1 ? 'trener' : 'trenere' }}
      </p>

      <ol class="kort">
        <li
          v-for="k in kort"
          :key="k.nokkel"
          class="kort__rad"
          :class="{ 'kort__rad--na': k.na, 'kort__rad--ferdig': k.ferdig, 'kort__rad--apen': apent === k.i }"
        >
          <button type="button" class="kort__hode" :aria-expanded="apent === k.i ? 'true' : 'false'" @click="apent = apent === k.i ? null : k.i">
            <span class="kort__topp">
              <span v-if="k.tid" class="kort__tid">{{ k.tid }}</span>
              <span v-if="k.na" class="kort__na">Nå</span>
              <span v-if="k.d.type && k.d.type !== 'none'" class="kort__type" :class="`kort__type--${k.d.type}`">{{ k.d.type === 'diff' ? 'Diff' : 'Mix' }}</span>
            </span>
            <span class="kort__navn">{{ k.d.text }}</span>
            <span class="kort__deling">
              <template v-if="k.plan">{{ k.plan.antall }} {{ k.plan.antall === 1 ? 'gruppe' : 'grupper' }} · {{ k.plan.iHver }} i hver</template>
              <template v-else>Alle sammen</template>
            </span>
            <!-- Lukket kort: hvem som tar hvilken gruppe, på én linje. -->
            <span v-if="k.plan && apent !== k.i && k.trenere.some(t => t.length)" class="kort__trenere">
              <template v-for="(t, gi) in k.trenere" :key="gi"><span v-if="t.length" class="kort__trener">{{ gi + 1 }}<template v-if="k.plan.grupper[gi]?.niva"> {{ k.plan.grupper[gi].niva }}</template> {{ t.join(', ') }}</span></template>
            </span>
          </button>

          <div v-if="apent === k.i" class="kort__kropp">
            <TreningsGrupper
              v-if="k.plan"
              :plan="k.plan"
              :type="k.d.type"
              :til-stede="tilStede.length"
              :navn="navn"
              :trenere="k.trenere"
              @bytt="(a, b) => bytt(k, a, b)"
              @borte="id => okt.settSpiller(id, false)"
              @antall="n => settAntall(k, n)"
              @bland="bland(k)"
            />
            <button type="button" class="kort__om" @click="omOvelse = k.d">Om øvelsen</button>
          </div>
        </li>
      </ol>
    </div>

    <Sheet :show="!!omOvelse" :title="omOvelse?.text || ''" @close="omOvelse = null">
      <ExerciseView v-if="omOvelse" :exercise="omOvelse" :minutes="omOvelse.minutes || 0" />
    </Sheet>

    <ConfirmDialog
      :show="visSlett"
      title="Slett økta?"
      message="Oppmøtet for denne treninga blir borte, også fra statistikken."
      confirm-label="Slett"
      variant="warning"
      @confirm="slett"
      @cancel="visSlett = false"
    />
  </div>
</template>

<style scoped>
.okt {
  min-height: 100vh;
  background: var(--ds-color-bg);
  padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
}

.okt__bar {
  display: flex; align-items: center; gap: var(--ds-space-sm);
  padding: var(--ds-space-md) var(--ds-space-lg);
  position: sticky; top: 0; z-index: var(--ds-z-sticky);
  background: var(--ds-color-bg);
  border-bottom: 1px solid var(--ds-color-border-light, var(--ds-color-border));
}
.okt__back {
  display: grid; place-items: center; width: 34px; height: 34px;
  border: none; border-radius: var(--ds-radius-md); background: transparent;
  color: var(--ds-color-text-secondary); cursor: pointer;
}
.okt__back svg { width: 20px; height: 20px; }
.okt__title {
  font-weight: var(--ds-weight-semibold);
  font-size: var(--ds-text-md);
  color: var(--ds-color-text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.okt__dato { font-weight: var(--ds-weight-medium); color: var(--ds-color-text-tertiary); }
.okt__lenke {
  margin-left: auto; flex: none;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  padding: 6px 12px;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}

.okt__tom { padding: var(--ds-space-xl) var(--ds-space-lg); text-align: center; color: var(--ds-color-text-tertiary); }

.okt__h1 {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-2xl);
  font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
  margin: 0;
}

/* ── Hvem er her? ── */
.oppm { max-width: 560px; margin: 0 auto; padding: var(--ds-space-lg); }
.oppm__hode { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ds-space-md); }
.oppm__hode--trenere { margin-top: var(--ds-space-xl); }
.oppm__h2 { margin: 0; font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.oppm__teller { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); font-variant-numeric: tabular-nums; }
.oppm__teller strong { font-size: var(--ds-text-xl); color: var(--ds-color-text-primary); }
.oppm__hjelp { margin: var(--ds-space-xs) 0 var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }

/* Store mål: tjue navn trykkes med tommelen i kulda. */
.oppm__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
  margin-top: var(--ds-space-sm);
}
.oppm__navn {
  min-height: 48px;
  padding: 0 10px;
  border: 1.5px solid var(--ds-color-accent);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-accent-light, var(--ds-color-bg-elevated));
  color: var(--ds-color-text-primary);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease, transform .1s ease;
  -webkit-tap-highlight-color: transparent;
}
.oppm__navn:active { transform: scale(0.96); }
.oppm__navn--borte {
  border-color: var(--ds-color-border);
  background: transparent;
  color: var(--ds-color-text-tertiary);
  text-decoration: line-through;
}

.oppm__fot {
  position: sticky;
  bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  margin-top: var(--ds-space-xl);
  padding-top: var(--ds-space-sm);
  background: var(--ds-color-bg);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}
.okt__start {
  display: block; width: 100%;
  padding: 16px; border: none; border-radius: var(--ds-radius-lg);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  font-family: var(--ds-font-body); font-size: var(--ds-text-lg); font-weight: var(--ds-weight-bold);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.okt__start:disabled { opacity: .45; cursor: default; }
.okt__slett {
  align-self: center;
  border: 0; background: none; padding: 8px;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-error, var(--ds-color-text-secondary));
  cursor: pointer;
}

/* ── Økta ── */
.okt__wrap { max-width: 560px; margin: 0 auto; padding: var(--ds-space-md) var(--ds-space-lg); }
.okt__sum { margin: 0 0 var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.okt__sum strong { color: var(--ds-color-text-primary); font-variant-numeric: tabular-nums; }

.kort { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ds-space-sm); }
.kort__rad {
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  overflow: hidden;
}
.kort__rad--na { border-color: var(--ds-color-accent); box-shadow: 0 0 0 1px var(--ds-color-accent); }
.kort__rad--ferdig:not(.kort__rad--apen) { opacity: .6; }

.kort__hode {
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  width: 100%;
  padding: var(--ds-space-md);
  border: 0; background: none; text-align: left; cursor: pointer;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
}
.kort__topp { display: flex; align-items: center; gap: var(--ds-space-sm); min-height: 18px; }
.kort__tid { font-size: var(--ds-text-xs); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-tertiary); font-variant-numeric: tabular-nums; }
.kort__na {
  font-size: 0.6875rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  color: var(--ds-color-accent-text); background: var(--ds-color-accent);
  border-radius: var(--ds-radius-full); padding: 1px 7px;
}
.kort__type {
  font-size: 0.6875rem; font-weight: 600; letter-spacing: .02em; text-transform: uppercase;
  padding: 1px 7px; border-radius: var(--ds-radius-full);
  color: var(--ds-color-text-secondary);
  box-shadow: inset 0 0 0 1px var(--ds-color-border);
}
.kort__navn { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); line-height: 1.3; }
.kort__deling { font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); font-variant-numeric: tabular-nums; }
.kort__trenere { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 2px; }
.kort__trener { font-size: var(--ds-text-xs); color: var(--ds-color-text-secondary); white-space: nowrap; }

.kort__kropp {
  padding: 0 var(--ds-space-md) var(--ds-space-md);
  border-top: 1px solid var(--ds-color-border);
  padding-top: var(--ds-space-sm);
}
.kort__om {
  margin-top: var(--ds-space-md);
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-subtle);
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
  .oppm__navn { transition: none; }
}
</style>
