<script setup>
// DEL INN — grupper eller lag på sekunder, delt mellom trenerne.
//
// Én trener teller opp og deler inn; de andre ser det samme på sin telefon
// innen noen sekunder (useDelInn, én rad per kull per dag). Gruppene regnes
// ut på hver telefon med samme motor (lib/grupper → delInn), av de samme
// valgene, så alle ser det samme.
//
// Hvem som er med:
//   - Trening i dag: oppmøtet på økta. Første trykk lagrer oppmøtet, så
//     statistikken teller som før.
//   - Andre dager: listen står i Del inn-raden. Ikke telt = hele kullet.
//   - Gjester (spillere fra andre lag) står alltid i Del inn-raden, med navn
//     og nivå. De er med i fordelingen, ikke i lagets oppmøtestatistikk.
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTrainingWeek } from '../composables/useTrainingWeek'
import { useExercises, resolveDrills } from '../composables/useExercises'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerLevels } from '../composables/usePlayerLevels'
import { useCoaches } from '../composables/useCoaches'
import { useTreningsOkt, hentDagensOppmote, erTreningsdag } from '../composables/useTreningsOkt'
import { useDelInn } from '../composables/useDelInn'
import { useToast } from '../composables/useToast'
import { useAuth } from '../stores/auth'
import { delInn, kortnavn } from '../lib/grupper'
import { meldEvent } from '../lib/sporing'
import OppmoteGrid from '../components/OppmoteGrid.vue'
import Sheet from '../components/Sheet.vue'
import Steg from '../components/Steg.vue'

const router = useRouter()
const { isCoach, coach } = useAuth()
const { days, fetchWeek } = useTrainingWeek()
const { exercises, fetchExercises } = useExercises()
const { players, fetchPlayers } = usePlayers()
const { fetchPlayerLevels, levelFor } = usePlayerLevels()
const { coaches, fetchCoaches } = useCoaches()
const okt = useTreningsOkt()
const run = okt.run
const delt = useDelInn()
const toast = useToast()

// Dagens trening: den med dagens ukedag. Har flere den, vinner den som har
// oppmøtet lagret.
const idag = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d })()
const lagretIdag = ref(null) // null = ikke hentet ennå
const session = computed(() => {
  if (!lagretIdag.value) return null
  const dagens = days.value.filter(s => s.weekday === idag && erTreningsdag(s))
  return dagens.find(s => s.id in lagretIdag.value) || dagens[0] || null
})
const drills = computed(() => (session.value ? resolveDrills(session.value.drills, exercises.value) : []))
const dagensRun = computed(() => (run.value && !run.value.lokal && session.value && run.value.session_id === session.value.id ? run.value : null))
const dag = computed(() => delt.dag.value)
const klar = computed(() => !!players.value.length && !!lagretIdag.value && delt.lastet.value && (!session.value || okt.lastet.value))

const gjester = computed(() => dag.value?.gjester || [])
const gjestIder = computed(() => new Set(gjester.value.map(g => g.id)))
const navn = computed(() => ({
  ...kortnavn(players.value),
  ...Object.fromEntries(gjester.value.map(g => [g.id, g.navn]))
}))
const trenerNavn = computed(() => kortnavn(coaches.value))
const navnPa = ids => {
  const n = ids.map(id => trenerNavn.value[id]).filter(Boolean)
  return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} og ${n[n.length - 1]}`
}

// ── Hvem er med ─────────────────────────────────────────────────────────────
// Trykk som ikke er lagret ennå, ligger oppå til lagringen er ferdig, så
// brikken skifter med en gang.
const ventSp = ref({})
const ventTr = ref({})
const baseSpillere = computed(() => {
  if (dagensRun.value) return new Set(dagensRun.value.spillere)
  if (!session.value && dag.value?.spillere) return new Set(dag.value.spillere)
  return new Set(players.value.map(p => p.id))
})
const baseTrenere = computed(() => {
  if (dagensRun.value) return new Set(dagensRun.value.trenere)
  if (!session.value && dag.value?.trenere) return new Set(dag.value.trenere)
  return new Set()
})
const erHer = id => (id in ventSp.value ? ventSp.value[id] : baseSpillere.value.has(id))
const trenerHer = id => (id in ventTr.value ? ventTr.value[id] : baseTrenere.value.has(id))
const sortert = computed(() => [...players.value].sort((a, b) => a.name.localeCompare(b.name, 'no')))
// Sortert på id: rekkefølgen styrer trekningen, og den skal være lik på alle
// telefonene uansett hvordan lista kom fra serveren.
const her = computed(() => [
  ...players.value.filter(p => erHer(p.id)).map(p => ({ id: p.id, niva: levelFor(p.id) })),
  ...gjester.value.map(g => ({ id: g.id, niva: g.niva || null }))
].sort((a, b) => (a.id < b.id ? -1 : 1)))
const trenere = computed(() => coaches.value.filter(c => trenerHer(c.id)).map(c => c.id).sort())
const visOppmote = ref(false)

// Trening i dag uten lagret oppmøte: første trykk lagrer det, med alle
// spillerne og de trenerne som er krysset av.
let starter = null
async function sikreOkt() {
  if (dagensRun.value) return true
  if (!starter) {
    const sp = players.value.map(p => p.id)
    const tr = coaches.value.filter(c => baseTrenere.value.has(c.id)).map(c => c.id)
    starter = okt.start(session.value, sp, tr).finally(() => { starter = null })
  }
  return starter
}

async function vekslSpiller(id) {
  const til = !erHer(id)
  ventSp.value = { ...ventSp.value, [id]: til }
  try {
    if (session.value) {
      if (await sikreOkt()) await okt.settSpiller(id, til)
      else toast.show('Fikk ikke lagret oppmøtet. Prøv igjen.', 'error')
    } else {
      const liste = players.value.map(p => p.id).filter(x => erHer(x))
      await delt.lagre({ spillere: liste }, coach.value)
    }
  } finally {
    const { [id]: _, ...rest } = ventSp.value
    ventSp.value = rest
  }
}
async function vekslTrener(id) {
  const til = !trenerHer(id)
  ventTr.value = { ...ventTr.value, [id]: til }
  try {
    if (session.value) {
      if (await sikreOkt()) await okt.settTrener(id, til)
    } else {
      const liste = coaches.value.map(c => c.id).filter(x => trenerHer(x))
      await delt.lagre({ trenere: liste }, coach.value)
    }
  } finally {
    const { [id]: _, ...rest } = ventTr.value
    ventTr.value = rest
  }
}

// ── Gjester ─────────────────────────────────────────────────────────────────
// En spiller fra et annet lag, bare for i dag. Navn og nivå; uten nivå havner
// gjesten i midten (B), som en spiller uten nivå.
const nyGjest = ref({ navn: '', niva: 'B' })
const leggerTilGjest = ref(false)
async function leggTilGjest() {
  const navnet = nyGjest.value.navn.trim()
  if (!navnet) return
  const id = `gjest-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const niva = nyGjest.value.niva
  // Skjemaet lukkes med en gang; lagringen går i bakgrunnen.
  nyGjest.value = { navn: '', niva }
  leggerTilGjest.value = false
  meldEvent('del_inn_gjest_lagt_til', { niva })
  await delt.lagre({ gjester: [...gjester.value, { id, navn: navnet, niva }] }, coach.value)
}
async function fjernGjest(id) {
  await delt.lagre({ gjester: gjester.value.filter(g => g.id !== id) }, coach.value)
}

// ── Valgene, delt ───────────────────────────────────────────────────────────
// Hver fane husker sitt: type, antall (null = regnet ut) og frø.
const STANDARD = {
  form: 'grupper',
  grupper: { type: 'diff', antall: null, seed: 1, balanse: 'antall' },
  lag: { type: 'mix', antall: null, seed: 1 }
}
const valg = computed(() => {
  const d = dag.value?.valg || {}
  return {
    form: d.form || STANDARD.form,
    grupper: { ...STANDARD.grupper, ...(d.grupper || {}) },
    lag: { ...STANDARD.lag, ...(d.lag || {}) }
  }
})
const form = computed(() => valg.value.form)
const v = computed(() => valg.value[form.value])
function settValg(endring) {
  delt.lagre({ valg: { ...valg.value, ...endring } }, coach.value)
}
function sett(endring) {
  settValg({ [form.value]: { ...v.value, ...endring } })
}
function velgForm(f) { if (f !== form.value) settValg({ form: f }) }
const forsteMix = computed(() => drills.value.find(d => d.type === 'mix') || null)
const runde = computed(() => dagensRun.value?.state?._runde || 0)
const resultat = computed(() => delInn({
  spillere: her.value,
  trenere: trenere.value,
  form: form.value,
  type: v.value.type,
  antall: v.value.antall,
  runde: runde.value,
  seed: v.value.seed + runde.value,
  drill: form.value === 'lag' ? forsteMix.value : null,
  balanse: v.value.balanse || null
}))
function velgBalanse(b) { if (b !== v.value.balanse) sett({ balanse: b }) }
const min = computed(() => (form.value === 'lag' ? 2 : 1))
const maks = computed(() => Math.max(min.value, Math.min(6, form.value === 'lag' ? Math.floor(her.value.length / 2) : her.value.length)))
function velgType(t) { if (t !== v.value.type) sett({ type: t, antall: null }) }
function velgAntall(n) { sett({ antall: n }) }
function trekkPaNytt() {
  sett({ seed: v.value.seed + 1 })
  meldEvent('del_inn_trukket', { form: form.value })
}

// «Endret 17:05 av Alex», eller «av deg».
const endretTekst = computed(() => {
  const d = dag.value
  if (!d?.endret_at) return ''
  const kl = new Date(d.endret_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  const hvem = d.endret_av && d.endret_av === coach.value?.id ? 'deg' : (trenerNavn.value[d.endret_av] || d.endret_navn)
  return hvem ? `Endret ${kl} av ${hvem}` : `Endret ${kl}`
})

// Byttet en annen trener noe mens du ser på? Si fra, kort.
watch(() => dag.value?.endret_at, (ny, gammel) => {
  const d = dag.value
  if (!gammel || !ny || !d || d.endret_av === coach.value?.id) return
  const hvem = trenerNavn.value[d.endret_av] || d.endret_navn
  if (hvem) toast.show(`${hvem} endret inndelingen`, 'info', 2500)
})

async function nullstill() {
  await delt.nullstill()
  meldEvent('del_inn_nullstilt')
}

let stoppOkt = null
let stoppDelt = null
watch(session, s => {
  stoppOkt?.()
  stoppOkt = s ? okt.folg(s) : null
}, { immediate: true })
onMounted(() => {
  hentDagensOppmote().then(m => { lagretIdag.value = m || {} })
  stoppDelt = delt.folg()
  fetchWeek()
  fetchExercises()
  fetchPlayers()
  fetchPlayerLevels()
  fetchCoaches()
  meldEvent('del_inn_apnet')
})
onUnmounted(() => { stoppOkt?.(); stoppDelt?.() })

const sorterNavn = ids => ids.filter(id => navn.value[id]).sort((a, b) => navn.value[a].localeCompare(navn.value[b], 'no'))

function tilbake() {
  if (window.history.state?.back) router.back()
  else router.push('/')
}
</script>

<template>
  <div class="del">
    <header class="del__bar">
      <button class="del__back" aria-label="Tilbake" @click="tilbake">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <span class="del__title">Del inn</span>
      <button v-if="isCoach && klar" type="button" class="del__her" @click="visOppmote = true">
        <svg class="del__her-ikon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3.2 3.2 0 0 1 0 6.3" /><path d="M18 14.3c1.8.8 3 2.6 3 4.7" /></svg>
        <span><strong>{{ her.length }}</strong> {{ her.length === 1 ? 'spiller' : 'spillere' }}<template v-if="trenere.length"> · <strong>{{ trenere.length }}</strong> {{ trenere.length === 1 ? 'trener' : 'trenere' }}</template></span>
        <svg class="del__her-pil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
    </header>

    <p v-if="!isCoach" class="del__tom">Del inn er for trenerne.</p>
    <p v-else-if="!klar" class="del__tom">Laster …</p>

    <template v-else>
      <div class="del__styr">
        <div class="del__fane" role="tablist" aria-label="Grupper eller lag">
          <button type="button" role="tab" :class="['del__fane-knapp', { 'del__fane-knapp--aktiv': form === 'grupper' }]" :aria-selected="form === 'grupper' ? 'true' : 'false'" @click="velgForm('grupper')">Grupper</button>
          <button type="button" role="tab" :class="['del__fane-knapp', { 'del__fane-knapp--aktiv': form === 'lag' }]" :aria-selected="form === 'lag' ? 'true' : 'false'" @click="velgForm('lag')">Lag</button>
        </div>
        <div class="del__rad">
          <div class="ds-pills" role="group" aria-label="Nivå">
            <button type="button" :class="['ds-pill', { 'ds-pill--active': v.type === 'diff' }]" :aria-pressed="v.type === 'diff' ? 'true' : 'false'" @click="velgType('diff')">Diff</button>
            <button type="button" :class="['ds-pill', { 'ds-pill--active': v.type === 'mix' }]" :aria-pressed="v.type === 'mix' ? 'true' : 'false'" @click="velgType('mix')">Mix</button>
          </div>
          <Steg :verdi="resultat.antall" :min="min" :maks="maks" :navn="form === 'lag' ? 'Antall lag' : 'Antall grupper'" @endre="velgAntall" />
        </div>
        <div v-if="form === 'grupper' && v.type === 'diff'" class="del__balanse" role="group" aria-label="Hvordan nivågruppene deles">
          <button type="button" :class="['del__balanse-knapp', { 'del__balanse-knapp--aktiv': v.balanse === 'niva' }]" :aria-pressed="v.balanse === 'niva' ? 'true' : 'false'" @click="velgBalanse('niva')">
            <strong>Rent nivå</strong>
            <span>Kan bli ulikt store</span>
          </button>
          <button type="button" :class="['del__balanse-knapp', { 'del__balanse-knapp--aktiv': v.balanse === 'antall' }]" :aria-pressed="v.balanse === 'antall' ? 'true' : 'false'" @click="velgBalanse('antall')">
            <strong>Like store</strong>
            <span>Nivå først, så jevnet ut</span>
          </button>
        </div>
        <div v-if="resultat.info || form === 'lag'" class="del__rad del__rad--info">
          <span class="del__info">{{ resultat.info }}</span>
          <button v-if="form === 'lag'" type="button" class="del__trekk" @click="trekkPaNytt">Trekk på nytt</button>
        </div>
      </div>

      <p class="del__delt" aria-live="polite">
        <span class="del__delt-prikk" aria-hidden="true" />
        <span>{{ endretTekst || 'Trenerne ser det samme som deg' }}</span>
      </p>

      <p v-if="!her.length" class="del__tom">Ingen er med.</p>

      <div v-else-if="form === 'grupper'" class="kortene">
        <div v-for="(e, i) in resultat.enheter" :key="e.id" class="kort">
          <div class="kort__hode">
            <span v-if="resultat.type === 'diff' && e.nivaer.length" class="kort__niva" :aria-label="`Nivå ${e.navn}`">{{ e.nivaer.join('') }}</span>
            <span class="kort__tittel">
              <template v-if="resultat.type === 'diff'">{{ navnPa(e.trenere) || `Gruppe ${i + 1}` }}</template>
              <template v-else>{{ e.navn }}<span v-if="e.trenere.length" class="kort__trener"> · {{ navnPa(e.trenere) }}</span></template>
            </span>
            <span class="kort__ant">{{ e.spillere.length }}</span>
          </div>
          <p class="kort__navn"><span v-for="(id, ni) in sorterNavn(e.spillere)" :key="id">{{ ni ? ' · ' : '' }}{{ navn[id] }}<span v-if="gjestIder.has(id)" class="kort__gjest"> gjest</span></span></p>
        </div>
      </div>

      <div v-else class="kortene">
        <div v-for="(b, bi) in resultat.baner" :key="bi" class="bane">
          <p class="bane__hode">
            <strong>Bane {{ bi + 1 }}</strong>
            <span v-if="b.trenere.length">{{ navnPa(b.trenere) }}</span>
          </p>
          <div class="kortene">
            <div v-for="li in b.lag" :key="li" class="kort" :data-farge="resultat.enheter[li].navn">
              <div class="kort__hode">
                <span class="kort__vest" aria-hidden="true" />
                <span class="kort__tittel">{{ resultat.enheter[li].navn }}</span>
                <span v-if="b.pluss === li" class="kort__pluss">+ trener</span>
                <span class="kort__ant">{{ resultat.enheter[li].spillere.length }}</span>
              </div>
              <p class="kort__navn"><span v-for="(id, ni) in sorterNavn(resultat.enheter[li].spillere)" :key="id">{{ ni ? ' · ' : '' }}{{ navn[id] }}<span v-if="gjestIder.has(id)" class="kort__gjest"> gjest</span></span></p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="dag" class="del__slutt">
        <button type="button" class="del__nullstill" @click="nullstill">Start på nytt</button>
      </div>
    </template>

    <Sheet :show="visOppmote" title="Hvem mangler?" tall @close="visOppmote = false">
      <p class="del__teller"><strong>{{ her.length }}</strong> av {{ players.length + gjester.length }}</p>
      <OppmoteGrid
        :spillere="sortert"
        :trenere="coaches"
        :navn="navn"
        :trener-navn="trenerNavn"
        :er-her="erHer"
        :trener-her="trenerHer"
        :rigger-valg="false"
        @spiller="vekslSpiller"
        @trener="vekslTrener"
      />

      <section class="gjest">
        <h3 class="gjest__tittel">Gjester</h3>
        <p v-if="!gjester.length && !leggerTilGjest" class="gjest__hint">Spillere fra andre lag som er med i dag.</p>
        <div v-if="gjester.length" class="gjest__liste">
          <span v-for="g in gjester" :key="g.id" class="gjest__brikke">
            <span class="gjest__niva">{{ g.niva || '–' }}</span>
            {{ g.navn }}
            <button type="button" class="gjest__fjern" :aria-label="`Fjern ${g.navn}`" @click="fjernGjest(g.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
            </button>
          </span>
        </div>
        <form v-if="leggerTilGjest" class="gjest__ny" @submit.prevent="leggTilGjest">
          <input v-model="nyGjest.navn" class="ds-input" type="text" placeholder="Navn" aria-label="Navn på gjesten" autocomplete="off" enterkeyhint="done" autofocus />
          <div class="gjest__rad">
            <div class="ds-pills" role="group" aria-label="Nivå">
              <button v-for="n in ['A', 'B', 'C']" :key="n" type="button" :class="['ds-pill', { 'ds-pill--active': nyGjest.niva === n }]" :aria-pressed="nyGjest.niva === n ? 'true' : 'false'" @click="nyGjest.niva = n">{{ n }}</button>
            </div>
            <button type="submit" class="ds-btn ds-btn--primary gjest__legg" :disabled="!nyGjest.navn.trim()">Legg til</button>
          </div>
        </form>
        <button v-else type="button" class="gjest__apne" @click="leggerTilGjest = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Legg til gjest
        </button>
      </section>
      <template #footer>
        <button type="button" class="del__bruk" @click="visOppmote = false">Ferdig</button>
      </template>
    </Sheet>
  </div>
</template>

<style scoped>
.del {
  min-height: 100vh;
  background: var(--ds-color-bg);
  padding-bottom: calc(110px + env(safe-area-inset-bottom, 0px));
}
.del__bar {
  display: flex; align-items: center; gap: var(--ds-space-sm);
  padding: var(--ds-space-md) var(--ds-space-lg);
  position: sticky; top: 0; z-index: var(--ds-z-sticky);
  background: var(--ds-color-bg);
}
.del__back {
  display: grid; place-items: center; width: 44px; height: 44px; margin-left: -12px;
  border: none; border-radius: var(--ds-radius-md); background: transparent;
  color: var(--ds-color-text-secondary); cursor: pointer;
}
.del__back svg { width: 22px; height: 22px; }
.del__title { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.del__her {
  margin-left: auto; flex: none;
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 12px 0 14px;
  border: 1px solid var(--ds-color-border);
  border-radius: 999px;
  background: var(--ds-color-bg-elevated);
  box-shadow: var(--ds-shadow-sm, 0 1px 2px rgba(15, 15, 15, .08));
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium, 500);
  color: var(--ds-color-text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.del__her:active { background: var(--ds-color-bg-hover); }
.del__her strong { font-weight: var(--ds-weight-bold); font-variant-numeric: tabular-nums; }
.del__her-ikon { width: 18px; height: 18px; flex: none; }
.del__her-pil { width: 16px; height: 16px; flex: none; color: var(--ds-color-text-secondary); }
:global([data-theme="dark"]) .del__her { background: var(--ds-color-bg-hover); }
.del__tom { padding: var(--ds-space-xl) var(--ds-space-lg); text-align: center; color: var(--ds-color-text-tertiary); }

.del__styr, .kortene { max-width: 560px; margin-left: auto; margin-right: auto; }
.del__styr {
  padding: var(--ds-space-xs) var(--ds-space-lg) var(--ds-space-md);
  border-bottom: 1px solid var(--ds-color-border-light, var(--ds-color-border));
}
.del__rad { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md); }
.del__rad + .del__rad, .del__fane + .del__rad { margin-top: var(--ds-space-md); }
.del__rad--info { min-height: 44px; margin-top: var(--ds-space-sm) !important; }
.del__rad--info .del__info { text-align: left; }

/* Grupper | Lag: faner i full bredde, som en segmentert bryter. */
.del__fane {
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px;
  padding: 4px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle, var(--ds-color-bg-elevated));
}
.del__fane-knapp {
  min-height: 44px;
  border: 0; border-radius: var(--ds-radius-full);
  background: transparent;
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease;
  -webkit-tap-highlight-color: transparent;
}
.del__fane-knapp--aktiv {
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  box-shadow: var(--ds-shadow-sm);
}
:global([data-theme="dark"]) .del__fane-knapp--aktiv { background: color-mix(in srgb, var(--ds-color-text-primary) 16%, var(--ds-color-bg-subtle)); }
/* Diff | Mix like høye som − 3 + ved siden av. */
.del__rad .ds-pill { min-height: 44px; padding: 0 18px; font-size: var(--ds-text-md); }

/* Delt: at de andre trenerne ser det samme, og hvem som endret sist. */
.del__delt {
  max-width: 560px; margin: var(--ds-space-md) auto 0; padding: 0 var(--ds-space-lg);
  display: flex; align-items: center; gap: 8px;
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
}
.del__delt-prikk {
  flex: none; width: 8px; height: 8px; border-radius: 50%;
  background: var(--ds-color-success, var(--ds-color-accent));
}

.del__slutt { max-width: 560px; margin: var(--ds-space-xl) auto 0; padding: 0 var(--ds-space-lg); text-align: center; }
.del__nullstill {
  min-height: 44px; padding: 0 var(--ds-space-md);
  border: 0; background: none;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
  text-decoration: underline; text-underline-offset: 3px;
  cursor: pointer;
}

.del__info { flex: 1; min-width: 0; text-align: right; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.del__info--under { margin: var(--ds-space-sm) 0 0; text-align: left; }
.del__trekk {
  flex: none; min-height: 44px; padding: 0 4px;
  border: 0; background: none;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  text-decoration: underline; text-underline-offset: 3px;
  cursor: pointer;
}

.kortene { display: flex; flex-direction: column; gap: var(--ds-space-sm); padding: var(--ds-space-md) var(--ds-space-lg) 0; }
.bane .kortene { padding: 0; }
.bane + .bane { margin-top: var(--ds-space-md); }
.bane__hode {
  display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 8px;
  margin: 0 0 var(--ds-space-sm);
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
}
.bane__hode strong { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.kort {
  padding: var(--ds-space-md) var(--ds-space-lg);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border-light, var(--ds-color-border));
  box-shadow: var(--ds-shadow-xs, none);
}
.kort__hode { display: flex; align-items: center; gap: var(--ds-space-md); }
/* Vestfargen som en prikk ved lagnavnet: lettere å finne «sitt» lag. */
.kort__vest { flex: none; width: 14px; height: 14px; border-radius: 50%; background: var(--vest, var(--ds-color-text-tertiary)); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .12); }
.kort[data-farge="Gul"] { --vest: #F2C200; }
.kort[data-farge="Rød"] { --vest: #D64545; }
.kort[data-farge="Blå"] { --vest: #2F6FDB; }
.kort[data-farge="Grønn"] { --vest: #2E9E5B; }
.kort[data-farge="Oransje"] { --vest: #F07F1A; }
.kort[data-farge="Hvit"] { --vest: #FFFFFF; }
.kort__niva {
  flex: none; display: grid; place-items: center;
  min-width: 32px; height: 28px; padding: 0 8px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  font-size: var(--ds-text-xs, 12px); font-weight: var(--ds-weight-bold);
}
.kort__tittel { min-width: 0; font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.kort__trener { font-weight: var(--ds-weight-regular, 400); color: var(--ds-color-text-secondary); }
.kort__pluss {
  flex: none; padding: 2px 10px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-xs, 12px); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}
.kort__ant { margin-left: auto; flex: none; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); font-variant-numeric: tabular-nums; }
.kort__navn { margin: var(--ds-space-sm) 0 0; font-size: var(--ds-text-md); line-height: 1.6; color: var(--ds-color-text-primary); }

.del__bruk {
  display: block; width: 100%;
  min-height: var(--ds-btn-h-lg);
  border: none; border-radius: var(--ds-radius-lg);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold);
  cursor: pointer;
}
.del__teller { margin: 0 0 var(--ds-space-lg); font-size: var(--ds-text-md); color: var(--ds-color-text-secondary); font-variant-numeric: tabular-nums; }
.del__teller strong { margin-right: 4px; font-size: var(--ds-text-xl); color: var(--ds-color-text-primary); }
.del__balanse { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ds-space-sm); margin-top: var(--ds-space-md); }
.del__balanse-knapp {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  min-height: 56px; padding: 10px 14px;
  border: 1.5px solid var(--ds-color-border); border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  text-align: left; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.del__balanse-knapp strong { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.del__balanse-knapp span { font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.del__balanse-knapp--aktiv { border-color: var(--ds-color-accent); box-shadow: inset 0 0 0 1px var(--ds-color-accent); }

.kort__gjest { font-size: var(--ds-text-xs); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-tertiary); }

.gjest { margin-top: var(--ds-space-xl); padding-top: var(--ds-space-lg); border-top: 1px solid var(--ds-color-border-light, var(--ds-color-border)); }
.gjest__tittel { margin: 0 0 var(--ds-space-sm); font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.gjest__hint { margin: 0 0 var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.gjest__liste { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); margin-bottom: var(--ds-space-md); }
.gjest__brikke {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 4px 0 6px;
  border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-md); color: var(--ds-color-text-primary);
}
.gjest__niva {
  display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%;
  background: var(--ds-color-bg-subtle); font-size: var(--ds-text-sm); font-weight: var(--ds-weight-bold);
}
.gjest__fjern {
  display: grid; place-items: center; width: 36px; height: 36px;
  border: 0; border-radius: 50%; background: transparent;
  color: var(--ds-color-text-secondary); cursor: pointer;
}
.gjest__fjern svg { width: 16px; height: 16px; }
.gjest__ny { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
.gjest__rad { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md); }
.gjest__rad .ds-pill { min-height: 44px; min-width: 48px; font-size: var(--ds-text-md); }
.gjest__legg { min-height: 44px; }
.gjest__apne {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 var(--ds-space-lg);
  border: 1.5px dashed var(--ds-color-border); border-radius: var(--ds-radius-full);
  background: transparent;
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary);
  cursor: pointer;
}
.gjest__apne svg { width: 16px; height: 16px; }
</style>
