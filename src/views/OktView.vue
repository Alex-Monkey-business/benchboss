<script setup>
// OPPMØTE — og det oppmøtet gir: grupper, trenere og utstyr for dem som kom.
//
// Først «Hvem er her?»: hele kullet og alle trenerne er på, trykk bort dem som
// mangler, «Lagre oppmøte». Så oversikten: utstyret for antallet, og én kort
// rad per øvelse. Ingen trekkspill — en rad som folder seg ut, skyver alt
// under seg, og siden hopper.
//
// Oppmøtet gjelder i dag. Ble det registrert for å prøve, nullstilles det
// nederst, og da teller det ikke i statistikken.
//
// Trykk en øvelse, så åpnes arket. Arket bytter innhold, ikke side:
//   Grupper    — det du leser opp på banen (standard)
//   Endre      — bytt navn, antall grupper, bland
//   Om øvelsen — gjennomføring, læringsmål, hva du ser etter
// Forrige/Neste står i arkets faste bunn, så du blar gjennom økta uten å lukke.
//
// Organiseringen er hovedsaken her; innholdet i øvelsen leses i ro og mak.
//
// Oppmøtet er delt: trykker Trond bort en spiller, forsvinner hun fra
// gruppene på din telefon også. Gruppene lagres ikke; de regnes likt på hver
// telefon av oppmøtet, nivåene og øvelsen, pluss trenernes inngrep.
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTrainingWeek } from '../composables/useTrainingWeek'
import { useExercises, resolveDrills, EQUIPMENT_TAGS } from '../composables/useExercises'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerLevels } from '../composables/usePlayerLevels'
import { useCoaches } from '../composables/useCoaches'
import { useTreningsOkt, datoFor } from '../composables/useTreningsOkt'
import { useAuth } from '../stores/auth'
import { grupperFor, ovelseNokkel, fordelTrenere, kortnavn, riggFor, RIGGER_FRA } from '../lib/grupper'
import { weekdayDateLabel } from '../lib/dateLabels'
import { meldEvent } from '../lib/sporing'
import TreningsGrupper from '../components/TreningsGrupper.vue'
import OppmoteGrid from '../components/OppmoteGrid.vue'
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
const datoTekst = computed(() => (dato.value ? weekdayDateLabel(dato.value).replace(/^\S+\s/, '') : ''))

const sortert = computed(() => [...players.value].sort((a, b) => a.name.localeCompare(b.name, 'no')))
const navn = computed(() => kortnavn(players.value))
const trenerNavn = computed(() => kortnavn(coaches.value))

// ── Hvem er her? ────────────────────────────────────────────────────────────
//
// Før start er dette et utkast på telefonen: alle er på, du trykker bort.
// Etter start skriver hvert trykk rett til økta (i oppmøte-arket).
const borteSpillere = ref(new Set())
const borteTrenere = ref(new Set())

function erHer(id) {
  return run.value ? run.value.spillere.includes(id) : !borteSpillere.value.has(id)
}
function trenerHer(id) {
  return run.value ? run.value.trenere.includes(id) : !borteTrenere.value.has(id)
}
const antallHer = computed(() => players.value.filter(p => erHer(p.id)).length)

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

// Rigger. Før start: forrige økts rigger, hvis han er her og dere er mange
// nok (RIGGER_FRA). Treneren kan velge noen andre, eller ingen. Etter start:
// det som står på økta.
const standardRigger = ref(null)
const riggerValgt = ref(undefined) // undefined = la standarden gjelde
const rigger = computed(() => {
  if (run.value) {
    const r = run.value.state?._rigger || null
    return r && run.value.trenere.includes(r) ? r : null
  }
  if (riggerValgt.value !== undefined) return riggerValgt.value && trenerHer(riggerValgt.value) ? riggerValgt.value : null
  const s = standardRigger.value
  const her = coaches.value.filter(c => trenerHer(c.id)).length
  return s && trenerHer(s) && her >= RIGGER_FRA ? s : null
})
function velgRigger(id) {
  if (run.value) return okt.settInngrep('_rigger', id)
  riggerValgt.value = id
}

const starter = ref(false)
async function start() {
  if (starter.value || !session.value) return
  starter.value = true
  const sp = players.value.filter(p => !borteSpillere.value.has(p.id)).map(p => p.id)
  const tr = coaches.value.filter(c => !borteTrenere.value.has(c.id)).map(c => c.id)
  await okt.start(session.value, sp, tr, rigger.value)
  meldEvent('okt_startet', { spillere: sp.length, trenere: tr.length })
  starter.value = false
  window.scrollTo({ top: 0 })
}

const visOppmote = ref(false)

// ── Økta ────────────────────────────────────────────────────────────────────
const tilStede = computed(() =>
  run.value
    ? players.value.filter(p => run.value.spillere.includes(p.id)).map(p => ({ id: p.id, niva: levelFor(p.id) }))
    : []
)
// Trenerne på gruppene — alle som er her, unntatt riggeren.
const trenereIOkta = computed(() =>
  run.value
    ? coaches.value.filter(c => run.value.trenere.includes(c.id) && c.id !== rigger.value).map(c => trenerNavn.value[c.id])
    : []
)

// Ingen klokke. Økta følger ikke en timeplan: en øvelse som flyter får
// fortsette, og gruppene går i ulikt tempo. Planlagt lengde står som
// rettesnor, rekkefølgen er alt annet.

// Trenerne står på samme plass hele økta; rotasjonen skjer fra trening til
// trening (_runde).
const kort = computed(() => {
  const runde = run.value?.state?._runde || 0
  return drills.value.map((d, i) => {
    const nokkel = ovelseNokkel(i, d)
    const plan = grupperFor(d, i, tilStede.value, run.value?.state?.[nokkel] || {})
    const trenere = plan ? fordelTrenere(plan.grupper, trenereIOkta.value, runde) : []
    return { d, i, nokkel, plan, trenere }
  })
})

// ── Arket for én øvelse ─────────────────────────────────────────────────────
const apen = ref(null) // indeks
const modus = ref('grupper') // 'grupper' | 'endre' | 'om'
const valgt = ref(null)
const aktiv = computed(() => (apen.value == null ? null : kort.value[apen.value] || null))

// Nytt innhold i arket starter på toppen — ellers lander du midt i «Vanlige
// feil» på neste øvelse fordi du sto der på den forrige.
async function tilToppen() {
  await nextTick()
  document.querySelectorAll('.ds-sheet__body').forEach(el => el.scrollTo({ top: 0 }))
}
function apne(i) {
  apen.value = i
  modus.value = 'grupper'
  valgt.value = null
  meldEvent('okt_ovelse_apnet')
}
function bytteModus(m) {
  modus.value = m
  valgt.value = null
  tilToppen()
}
function bla(d) {
  const j = apen.value + d
  if (j < 0 || j >= kort.value.length) return
  apen.value = j
  if (modus.value === 'endre') modus.value = 'grupper'
  valgt.value = null
  tilToppen()
}

// Tilbake inni arket: fra «Om øvelsen» eller Endre går du til gruppene, ikke
// ut av arket. Fra gruppene lukkes arket.
function tilbakeIArket() {
  if (modus.value === 'grupper') return false
  bytteModus('grupper')
  return true
}

function inngrep(k) { return run.value?.state?.[k.nokkel] || {} }
function bytt(a, b) {
  const k = aktiv.value
  const cur = inngrep(k)
  okt.settInngrep(k.nokkel, { ...cur, bytter: [...(cur.bytter || []), [a, b]] })
}
function settAntall(n) {
  const k = aktiv.value
  const cur = inngrep(k)
  // Byttene var gjort i en annen fordeling og gir ikke mening i den nye.
  okt.settInngrep(k.nokkel, { ...cur, antall: n === k.plan.foreslatt ? null : n, bytter: [] })
}
function bland() {
  const k = aktiv.value
  const cur = inngrep(k)
  okt.settInngrep(k.nokkel, { ...cur, seed: (cur.seed || 1) + 1, bytter: [] })
}
function ikkeHer() {
  if (!valgt.value) return
  okt.settSpiller(valgt.value, false)
  valgt.value = null
}

// Utstyret for dem som kom: stasjonene følger gruppene, ikke hele kullet.
const visUtstyr = ref(false)
const utstyr = computed(() => {
  const tags = riggFor(drills.value)
  return {
    ting: EQUIPMENT_TAGS.filter(t => tags.includes(t.value)).map(t => t.label),
    stasjoner: kort.value.filter(k => k.plan && k.plan.antall > 1).map(k => ({ navn: k.d.text, n: k.plan.antall }))
  }
})

const visSlett = ref(false)
async function slett() {
  visSlett.value = false
  await okt.slett()
  borteSpillere.value = new Set()
  borteTrenere.value = new Set()
  riggerValgt.value = undefined
  meldEvent('okt_nullstilt')
  window.scrollTo({ top: 0 })
}

let stopp = null
watch(session, s => {
  if (s && !stopp) stopp = okt.folg(s)
}, { immediate: true })

onMounted(async () => {
  okt.sisteRigger().then(r => { standardRigger.value = r })
  fetchWeek()
  fetchExercises()
  fetchPlayers()
  fetchPlayerLevels()
  fetchCoaches()
})
onUnmounted(() => {
  stopp?.()
})

function tilbake() {
  router.push(session.value ? `/trening/dag/${session.value.id}` : '/trening')
}
</script>

<template>
  <div class="okt">
    <header class="okt__bar">
      <button class="okt__back" aria-label="Tilbake" @click="tilbake">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="okt__title">{{ session?.title || 'Trening' }}<span v-if="datoTekst" class="okt__dato"> {{ datoTekst }}</span></span>
      <button v-if="run" type="button" class="okt__her" @click="visOppmote = true">
        <strong>{{ tilStede.length }}</strong> her
      </button>
    </header>

    <p v-if="!isCoach" class="okt__tom">Økta er for trenerne.</p>
    <p v-else-if="!session || !okt.lastet.value" class="okt__tom">Laster …</p>

    <!-- ── HVEM ER HER? ─────────────────────────────────────────── -->
    <div v-else-if="!run" class="oppm">
      <div class="oppm__hode">
        <h1 class="okt__h1">Hvem er her?</h1>
        <p class="oppm__teller"><strong>{{ antallHer }}</strong> av {{ players.length }}</p>
      </div>

      <OppmoteGrid
        :spillere="sortert"
        :trenere="coaches"
        :navn="navn"
        :trener-navn="trenerNavn"
        :er-her="erHer"
        :trener-her="trenerHer"
        :rigger="rigger"
        @spiller="vekslSpiller"
        @trener="vekslTrener"
        @rigger="velgRigger"
      />

      <div class="oppm__fot">
        <button type="button" class="okt__start" :disabled="!antallHer || starter" @click="start">
          Lagre oppmøte
        </button>
      </div>
    </div>

    <!-- ── ØKTA ─────────────────────────────────────────────────── -->
    <div v-else class="okt__wrap">
      <p v-if="rigger" class="okt__rigger">Rigger <strong>{{ trenerNavn[rigger] }}</strong></p>
      <button
        v-if="utstyr.ting.length || utstyr.stasjoner.length"
        type="button"
        class="utstyr-rad"
        @click="visUtstyr = true"
      >
        <span class="utstyr-rad__merke">Utstyr</span>
        <span class="utstyr-rad__ting">{{ utstyr.ting.join(', ') || `${utstyr.stasjoner.length} øvelser med stasjoner` }}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <ol class="rader">
        <li v-for="k in kort" :key="k.nokkel">
          <button type="button" class="rad" @click="apne(k.i)">
            <span class="rad__nr">{{ k.i + 1 }}</span>
            <span class="rad__tekst">
              <span class="rad__navn">{{ k.d.text }}</span>
              <span class="rad__meta">
                <template v-if="k.plan">{{ k.plan.antall }} {{ k.plan.antall === 1 ? 'gruppe' : 'grupper' }} · {{ k.plan.iHver }} i hver</template>
                <template v-else>Alle sammen</template>
                <template v-if="k.d.minutes"> · {{ k.d.minutes }} min</template>
              </span>
            </span>
            <svg class="rad__pil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </li>
      </ol>
      <button type="button" class="okt__slett" @click="visSlett = true">Nullstill oppmøtet</button>
    </div>

    <!-- Én øvelse. Arket bytter innhold; bunnen står fast. -->
    <Sheet :show="!!aktiv" :title="aktiv?.d.text || ''" tall :tilbake="tilbakeIArket" @close="apen = null">
      <template v-if="aktiv">
        <template v-if="modus !== 'om'">
          <div class="ark__meta">
            <span>{{ aktiv.d.minutes ? `${aktiv.d.minutes} min` : '' }}</span>
            <button type="button" class="ark__om" @click="bytteModus('om')">Om øvelsen</button>
          </div>
          <TreningsGrupper
            v-if="aktiv.plan"
            v-model:valgt="valgt"
            :plan="aktiv.plan"
            :type="aktiv.d.type"
            :til-stede="tilStede.length"
            :navn="navn"
            :trenere="aktiv.trenere"
            :redigerer="modus === 'endre'"
            @bytt="bytt"
            @antall="settAntall"
            @bland="bland"
          />
          <div v-else class="ark__alle">
            <p class="ark__alle-tittel">Alle sammen</p>
          </div>
        </template>
        <ExerciseView v-else :exercise="aktiv.d" :minutes="aktiv.d.minutes || 0" />
      </template>

      <template #footer>
        <div v-if="aktiv && modus === 'endre'" class="fot">
          <template v-if="valgt">
            <span class="fot__hint">Bytt <strong>{{ navn[valgt] }}</strong> med …</span>
            <button type="button" class="fot__knapp fot__knapp--hoved" @click="ikkeHer">Ikke her</button>
          </template>
          <template v-else>
            <span class="fot__hint">Trykk to navn for å bytte</span>
            <button type="button" class="fot__knapp fot__knapp--hoved" @click="bytteModus('grupper')">Ferdig</button>
          </template>
        </div>
        <div v-else-if="aktiv && modus === 'om'" class="fot">
          <button type="button" class="fot__knapp fot__knapp--bred" @click="bytteModus('grupper')">Tilbake til gruppene</button>
        </div>
        <div v-else-if="aktiv" class="fot">
          <button type="button" class="fot__pil" :disabled="apen === 0" aria-label="Forrige øvelse" @click="bla(-1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button v-if="aktiv.plan" type="button" class="fot__knapp" @click="bytteModus('endre')">Endre</button>
          <span v-else class="fot__luft"></span>
          <button type="button" class="fot__pil" :disabled="apen === kort.length - 1" aria-label="Neste øvelse" @click="bla(1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </template>
    </Sheet>

    <!-- Oppmøte under økta: kom for sent, gikk tidlig. -->
    <Sheet :show="visOppmote" title="Hvem er her?" tall @close="visOppmote = false">
      <p class="oppm__teller oppm__teller--ark"><strong>{{ antallHer }}</strong> av {{ players.length }}</p>
      <OppmoteGrid
        :spillere="sortert"
        :trenere="coaches"
        :navn="navn"
        :trener-navn="trenerNavn"
        :er-her="erHer"
        :trener-her="trenerHer"
        :rigger="rigger"
        @spiller="vekslSpiller"
        @trener="vekslTrener"
        @rigger="velgRigger"
      />
      <template #footer>
        <button type="button" class="fot__knapp fot__knapp--hoved fot__knapp--bred" @click="visOppmote = false">Ferdig</button>
      </template>
    </Sheet>

    <!-- Utstyret for dem som kom. -->
    <Sheet :show="visUtstyr" title="Utstyr" @close="visUtstyr = false">
      <p v-if="utstyr.ting.length" class="utstyr__ting">{{ utstyr.ting.join(' · ') }}</p>
      <ul v-if="utstyr.stasjoner.length" class="utstyr__liste">
        <li v-for="(x, i) in utstyr.stasjoner" :key="i">
          <span>{{ x.navn }}</span>
          <strong>{{ x.n }} stasjoner</strong>
        </li>
      </ul>
    </Sheet>

    <ConfirmDialog
      :show="visSlett"
      title="Nullstill oppmøtet?"
      message="Dagens oppmøte slettes og teller ikke i statistikken."
      confirm-label="Nullstill"
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
  display: grid; place-items: center; width: 36px; height: 36px; margin-left: -8px;
  border: none; border-radius: var(--ds-radius-md); background: transparent;
  color: var(--ds-color-text-secondary); cursor: pointer;
}
.okt__back svg { width: 22px; height: 22px; }
.okt__title {
  min-width: 0;
  font-weight: var(--ds-weight-semibold);
  font-size: var(--ds-text-md);
  color: var(--ds-color-text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.okt__dato { margin-left: 6px; font-weight: var(--ds-weight-medium); color: var(--ds-color-text-tertiary); }
.okt__her {
  margin-left: auto; flex: none;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
}
.okt__her strong { color: var(--ds-color-text-primary); font-variant-numeric: tabular-nums; }

.okt__tom { padding: var(--ds-space-xl) var(--ds-space-lg); text-align: center; color: var(--ds-color-text-tertiary); }

.okt__h1 {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-2xl);
  font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
  margin: 0;
}

/* ── Hvem er her? ── */
.oppm { max-width: 560px; margin: 0 auto; padding: var(--ds-space-xl) var(--ds-space-lg) 0; }
.oppm__hode { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ds-space-md); margin-bottom: var(--ds-space-lg); }
.oppm__teller { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); font-variant-numeric: tabular-nums; }
.oppm__teller strong { font-size: var(--ds-text-xl); color: var(--ds-color-text-primary); }
.oppm__teller--ark { margin-bottom: var(--ds-space-lg); }
.oppm__teller--ark strong { font-size: var(--ds-text-md); }

/* Fast over bunnmenyen, ikke sticky: en sticky knapp følger innholdet når
   du scroller til bunnen av navnelista, og da hopper den. */
.oppm { padding-bottom: 120px; }
.oppm__fot {
  position: fixed;
  left: 0; right: 0;
  bottom: calc(65px + env(safe-area-inset-bottom, 0px));
  z-index: calc(var(--ds-z-sticky) - 1);
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: var(--ds-color-bg);
  border-top: 1px solid var(--ds-color-border-light, var(--ds-color-border));
}
.oppm__fot .okt__start { max-width: 560px; margin: 0 auto; }
/* På stor skjerm ligger menyen øverst, så knappen går helt ned. */
@media (min-width: 768px) {
  .oppm__fot { bottom: 0; }
}
.okt__start {
  display: block; width: 100%;
  min-height: 56px; border: none; border-radius: var(--ds-radius-lg);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  font-family: var(--ds-font-body); font-size: var(--ds-text-lg); font-weight: var(--ds-weight-bold);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.okt__start:disabled { opacity: .45; cursor: default; }
.okt__slett {
  display: block;
  margin: var(--ds-space-3xl, 48px) auto 0;
  border: 0; background: none; padding: 8px;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-error, var(--ds-color-text-secondary));
  cursor: pointer;
}

/* ── Økta: én rad per øvelse ── */
.okt__wrap { max-width: 560px; margin: 0 auto; padding: var(--ds-space-lg); }
.rader { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ds-space-sm); }
.rad {
  display: grid;
  grid-template-columns: 20px 1fr 18px;
  align-items: center;
  gap: var(--ds-space-md);
  width: 100%;
  min-height: 76px;
  padding: var(--ds-space-md);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  text-align: left;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform .1s ease;
}
.rad:active { transform: scale(0.99); }

.rad__nr { font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-tertiary); font-variant-numeric: tabular-nums; }
.rad__tekst { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.rad__navn {
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary);
  line-height: 1.3;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.rad__meta { font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); font-variant-numeric: tabular-nums; }
.rad__pil { width: 18px; height: 18px; color: var(--ds-color-text-tertiary); }


/* ── Utstyr ── */
.utstyr-rad {
  display: flex; align-items: center; gap: var(--ds-space-md);
  width: 100%; min-height: 52px;
  padding: 0 var(--ds-space-md);
  margin-bottom: var(--ds-space-lg);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  color: inherit; text-align: left; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.utstyr-rad svg { width: 18px; height: 18px; flex: none; color: var(--ds-color-text-tertiary); }
.utstyr-rad__merke { flex: none; font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.utstyr-rad__ting { flex: 1; min-width: 0; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.utstyr__ting { margin: 0 0 var(--ds-space-lg); font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); line-height: 1.5; }
.utstyr__liste { list-style: none; margin: 0; padding: 0; }
.utstyr__liste li {
  display: flex; justify-content: space-between; gap: var(--ds-space-md);
  padding: var(--ds-space-md) 0;
  border-top: 1px solid var(--ds-color-border);
  font-size: var(--ds-text-sm); color: var(--ds-color-text-primary);
}
.utstyr__liste strong { flex: none; font-variant-numeric: tabular-nums; }

/* ── Arket ── */
.okt__rigger { margin: 0 0 var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.okt__rigger strong { color: var(--ds-color-text-primary); }
.ark__meta {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  min-height: 36px;
  margin: 0 0 var(--ds-space-lg);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  font-variant-numeric: tabular-nums;
}
.ark__alle { padding: var(--ds-space-lg) 0; }
.ark__alle-tittel { margin: 0; font-size: var(--ds-text-lg); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }

.fot {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  min-height: 48px;
}
.fot__pil {
  flex: none;
  display: grid; place-items: center;
  width: 44px; height: 48px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}
.fot__pil svg { width: 20px; height: 20px; }
.fot__pil:disabled { color: var(--ds-color-text-tertiary); opacity: .5; cursor: default; }
.fot__knapp {
  flex: 1 1 0;
  min-height: 48px;
  padding: 0 8px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  cursor: pointer;
}
.fot__knapp--hoved {
  border-color: var(--ds-color-accent);
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}
.fot__knapp--bred { width: 100%; }
.fot__luft { flex: 1 1 0; }
.ark__om {
  flex: none;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}
.fot__hint { flex: 1 1 0; min-width: 0; font-size: var(--ds-text-sm); line-height: 1.35; color: var(--ds-color-text-secondary); }
.fot__hint strong { color: var(--ds-color-text-primary); }
.fot__hint + .fot__knapp { flex: 0 0 auto; padding: 0 20px; }

@media (prefers-reduced-motion: reduce) {
  .rad { transition: none; }
}
</style>
