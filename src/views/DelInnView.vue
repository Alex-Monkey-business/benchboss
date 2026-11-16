<script setup>
// DEL INN — tre steg: trening → oppmøte → inndeling. Delt mellom trenerne.
//
// Oppmøtet tas bare her (Alex, 16. nov). Kjøreplanen viser øvelsene.
//
// Delt (useDelInn, én rad per kull per dag): valgt trening, gjester og
// valgene for inndelingen. Gruppene regnes ut på hver telefon med samme
// motor (lib/grupper → delInn), så alle ser det samme.
//
// Hvem som er med:
//   - Bare spillerne. Trenerne er ikke med (Alex, 16. nov: støy).
//   - Valgt trening: oppmøtet lagres på økta, så statistikken teller.
//   - Ingen trening (kamp, cup): listen står i Del inn-raden.
//   - Gjester står alltid i Del inn-raden. Med i fordelingen, ikke i
//     lagets oppmøtestatistikk.
//
// Stegene er per telefon. Har noen alt begynt i dag, åpner Del inn rett på
// inndelingen.
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTrainingWeek } from '../composables/useTrainingWeek'
import { useExercises, resolveDrills } from '../composables/useExercises'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerLevels } from '../composables/usePlayerLevels'
import { useCoaches } from '../composables/useCoaches'
import { useTreningsOkt, hentDagensOppmote } from '../composables/useTreningsOkt'
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

const dag = computed(() => delt.dag.value)
const lagretIdag = ref(null) // { session_id: antall } — null = ikke hentet

// ── Steg 1: trening ─────────────────────────────────────────────────────────
const UKEDAG = ['', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag']
const idag = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d })()
const dagerTil = wd => (wd ? (wd - idag + 7) % 7 : 0)
const treninger = computed(() => [...days.value].sort((a, b) => dagerTil(a.weekday) - dagerTil(b.weekday)))
// Nærmeste: den som alt har oppmøte i dag, ellers den med kortest vei fram.
const naermeste = computed(() => {
  const lagret = lagretIdag.value || {}
  return treninger.value.find(s => s.id in lagret) || treninger.value[0] || null
})
const INGEN = 'ingen'
const valgtOkt = computed(() => dag.value?.valg?.okt || naermeste.value?.id || INGEN)
const session = computed(() => (valgtOkt.value === INGEN ? null : days.value.find(s => s.id === valgtOkt.value) || null))
const nyttValg = ref(null) // valget i steg 1 før «Neste»
const valgtISteg1 = computed(() => nyttValg.value || valgtOkt.value)
// Undertittel: «I dag», ukedagen om tittelen ikke er den, og lengden.
function undertittel(s) {
  const deler = []
  if (dagerTil(s.weekday) === 0 && s.weekday) deler.push('I dag')
  else if (s.weekday && UKEDAG[s.weekday] !== s.title) deler.push(UKEDAG[s.weekday])
  const ov = (s.drills || []).filter(d => d?.text).length
  if (s.duration_min) deler.push(`${s.duration_min} min`)
  if (ov) deler.push(`${ov} ${ov === 1 ? 'øvelse' : 'øvelser'}`)
  return deler.join(' · ')
}

const drills = computed(() => (session.value ? resolveDrills(session.value.drills, exercises.value) : []))
const dagensRun = computed(() => (run.value && !run.value.lokal && session.value && run.value.session_id === session.value.id ? run.value : null))
const klar = computed(() => !!players.value.length && !!lagretIdag.value && delt.lastet.value && (!session.value || okt.lastet.value))

// ── Steg 2: hvem er her ─────────────────────────────────────────────────────
const gjester = computed(() => dag.value?.gjester || [])
const gjestIder = computed(() => new Set(gjester.value.map(g => g.id)))
const navn = computed(() => ({
  ...kortnavn(players.value),
  ...Object.fromEntries(gjester.value.map(g => [g.id, g.navn]))
}))
const trenerNavn = computed(() => kortnavn(coaches.value))

// Trykk som ikke er lagret ennå ligger oppå, så brikken skifter med en gang.
const ventSp = ref({})
const baseSpillere = computed(() => {
  if (dagensRun.value) return new Set(dagensRun.value.spillere)
  if (!session.value && dag.value?.spillere) return new Set(dag.value.spillere)
  return new Set(players.value.map(p => p.id))
})
const erHer = id => (id in ventSp.value ? ventSp.value[id] : baseSpillere.value.has(id))
const sortert = computed(() => [...players.value].sort((a, b) => a.name.localeCompare(b.name, 'no')))
// Sortert på id: rekkefølgen styrer trekningen og skal være lik på alle telefonene.
const her = computed(() => [
  ...players.value.filter(p => erHer(p.id)).map(p => ({ id: p.id, niva: levelFor(p.id) })),
  ...gjester.value.map(g => ({ id: g.id, niva: g.niva || null }))
].sort((a, b) => (a.id < b.id ? -1 : 1)))

const FEIL = 'Fikk ikke lagret. Prøv igjen.'
const meldFeil = ok => { if (!ok) toast.show(FEIL, 'error') }
const endre = async fn => meldFeil(await delt.endre(fn, coach.value))

// Valgt trening uten lagret oppmøte: første trykk lagrer det. Byttet dere
// trening, følger oppmøtet fra den forrige med.
let starter = null
let overfort = null
async function sikreOkt() {
  if (dagensRun.value) return true
  if (!starter) {
    const sp = overfort || players.value.map(p => p.id)
    overfort = null
    // Trenerne er ikke med i Del inn (Alex, 16. nov): bare spillerne telles.
    starter = okt.start(session.value, sp, [], null, () => ({}), { tving: true }).finally(() => { starter = null })
  }
  return starter
}

async function vekslSpiller(id) {
  const til = !erHer(id)
  ventSp.value = { ...ventSp.value, [id]: til }
  try {
    if (session.value) {
      if (await sikreOkt()) await okt.settSpiller(id, til)
      else toast.show(FEIL, 'error')
    } else {
      // Bare dette ene fraværet, lagt oppå den ferske lista i basen.
      const alle = players.value.map(p => p.id)
      await endre(rad => {
        const na = new Set(rad.spillere ?? alle)
        til ? na.add(id) : na.delete(id)
        return { spillere: alle.filter(x => na.has(x)) }
      })
    }
  } finally {
    const { [id]: _, ...rest } = ventSp.value
    ventSp.value = rest
  }
}
// Gjest: en spiller fra et annet lag, bare for i dag.
const visGjest = ref(false)
const nyGjest = ref({ navn: '', niva: 'B' })
async function leggTilGjest() {
  const navnet = nyGjest.value.navn.trim()
  if (!navnet) return
  const id = `gjest-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const niva = nyGjest.value.niva
  nyGjest.value = { navn: '', niva }
  visGjest.value = false
  meldEvent('del_inn_gjest_lagt_til', { niva })
  await endre(rad => ({ gjester: [...(rad.gjester || []), { id, navn: navnet, niva }] }))
}
async function fjernGjest(id) {
  await endre(rad => ({ gjester: (rad.gjester || []).filter(g => g.id !== id) }))
}

// ── Steg 3: inndeling ───────────────────────────────────────────────────────
const STANDARD = {
  form: 'grupper',
  grupper: { type: 'diff', antall: null, seed: 1, balanse: 'antall' },
  lag: { type: 'mix', antall: null, seed: 1 }
}
const valg = computed(() => {
  const d = dag.value?.valg || {}
  return {
    ...d,
    form: d.form || STANDARD.form,
    grupper: { ...STANDARD.grupper, ...(d.grupper || {}) },
    lag: { ...STANDARD.lag, ...(d.lag || {}) }
  }
})
const form = computed(() => valg.value.form)
const v = computed(() => valg.value[form.value])
// Valgene flettes inn i den ferske raden: ett valg om gangen.
function settValg(endring) {
  return endre(rad => ({ valg: { ...(rad.valg || {}), ...endring } }))
}
function sett(endring) {
  const f = form.value
  return endre(rad => {
    const gml = { ...STANDARD[f], ...(rad.valg?.[f] || {}) }
    const ny = typeof endring === 'function' ? endring(gml) : endring
    return { valg: { ...(rad.valg || {}), [f]: { ...gml, ...ny } } }
  })
}
function velgForm(f) { if (f !== form.value) settValg({ form: f }) }
const forsteMix = computed(() => drills.value.find(d => d.type === 'mix') || null)
const runde = computed(() => dagensRun.value?.state?._runde || 0)
const resultat = computed(() => delInn({
  spillere: her.value,
  trenere: [],
  form: form.value,
  type: v.value.type,
  antall: v.value.antall,
  runde: runde.value,
  seed: v.value.seed + runde.value,
  drill: form.value === 'lag' ? forsteMix.value : null,
  balanse: v.value.balanse || null
}))
const likeStore = computed(() => v.value.balanse !== 'niva')
function vekslLikeStore() { sett({ balanse: likeStore.value ? 'niva' : 'antall' }) }
const min = computed(() => (form.value === 'lag' ? 2 : 1))
const maks = computed(() => Math.max(min.value, Math.min(6, form.value === 'lag' ? Math.floor(her.value.length / 2) : her.value.length)))
function velgType(t) { if (t !== v.value.type) sett({ type: t, antall: null }) }
function velgAntall(n) { sett({ antall: n }) }
function trekkPaNytt() {
  sett(g => ({ seed: g.seed + 1 }))
  meldEvent('del_inn_trukket', { form: form.value })
}
// Endret av en annen trener: én kort linje, og en toast når det skjer.
const endretAvAnnen = computed(() => {
  const d = dag.value
  if (!d?.endret_at || !d.endret_av || d.endret_av === coach.value?.id) return ''
  const hvem = trenerNavn.value[d.endret_av] || d.endret_navn
  if (!hvem) return ''
  const kl = new Date(d.endret_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  return `${hvem} endret ${kl}`
})
watch(() => dag.value?.endret_at, (ny, gammel) => {
  const d = dag.value
  if (!gammel || !ny || !d || d.endret_av === coach.value?.id) return
  const hvem = trenerNavn.value[d.endret_av] || d.endret_navn
  if (hvem) toast.show(`${hvem} endret inndelingen`, 'info', 2500)
})

// ── Flyten ──────────────────────────────────────────────────────────────────
const STEG = ['trening', 'oppmote', 'inndeling']
const steg = ref(null)
const stegNr = computed(() => STEG.indexOf(steg.value))
watch(klar, k => {
  if (!k || steg.value) return
  // Har noen alt begynt i dag: rett på inndelingen.
  // lagretIdag er hentet før klar, så dette avhenger ikke av hvilken økt
  // som følges akkurat nå.
  const oppmoteIdag = Object.keys(lagretIdag.value || {}).length > 0
  steg.value = dag.value || oppmoteIdag ? 'inndeling' : 'trening'
}, { immediate: true })

async function nesteFraTrening() {
  const ny = valgtISteg1.value
  nyttValg.value = null
  if (ny !== valgtOkt.value || ny !== dag.value?.valg?.okt) {
    // Byttet trening: dagens oppmøte flyttes, så det ikke teller to ganger.
    if (ny !== valgtOkt.value && dagensRun.value) {
      overfort = ny === INGEN ? null : [...dagensRun.value.spillere]
      await okt.slett()
    }
    settValg({ okt: ny })
  }
  meldEvent('del_inn_trening_valgt', { ingen: ny === INGEN })
  gaTil('oppmote')
}
// Alle er her: oppmøtet lagres likevel, så økta teller i statistikken.
async function tilInndeling() {
  gaTil('inndeling')
  if (session.value && !dagensRun.value) meldFeil(await sikreOkt())
}
function gaTil(s) {
  steg.value = s
  window.scrollTo({ top: 0 })
}
function tilbake() {
  if (stegNr.value > 0) return gaTil(STEG[stegNr.value - 1])
  if (window.history.state?.back) router.back()
  else router.push('/')
}

const visMeny = ref(false)
async function nullstill() {
  visMeny.value = false
  if (dagensRun.value) await okt.slett()
  await delt.nullstill()
  meldEvent('del_inn_nullstilt')
  gaTil('trening')
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
const oktNavn = computed(() => session.value?.title || 'Uten trening')
</script>

<template>
  <div class="del">
    <header class="del__bar">
      <button class="del__ikonknapp" :aria-label="stegNr > 0 ? 'Forrige steg' : 'Tilbake'" @click="tilbake">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <div v-if="steg" class="del__framdrift" aria-hidden="true">
        <span v-for="(s, i) in STEG" :key="s" :class="['del__strek', { 'del__strek--pa': i <= stegNr }]" />
      </div>
      <button v-if="steg === 'inndeling' && dag" class="del__ikonknapp" aria-label="Start på nytt" @click="visMeny = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3 3 3 9 9 9" /></svg>
      </button>
      <span v-else class="del__ikonknapp del__ikonknapp--tom" />
    </header>

    <p v-if="!isCoach" class="del__tom">Del inn er for trenerne.</p>
    <p v-else-if="!klar || !steg" class="del__tom">Laster …</p>

    <!-- ── 1. TRENING ───────────────────────────────────────────── -->
    <section v-else-if="steg === 'trening'" class="del__side">
      <h1 class="del__h1">Hvilken trening?</h1>
      <div class="valg" role="radiogroup" aria-label="Trening">
        <button
          v-for="s in treninger"
          :key="s.id"
          type="button"
          role="radio"
          :aria-checked="valgtISteg1 === s.id ? 'true' : 'false'"
          :class="['valg__rad', { 'valg__rad--pa': valgtISteg1 === s.id }]"
          @click="nyttValg = s.id"
        >
          <span class="valg__tekst">
            <strong>{{ s.title }}</strong>
            <span v-if="undertittel(s)">{{ undertittel(s) }}</span>
          </span>
          <span class="valg__radio" aria-hidden="true" />
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="valgtISteg1 === INGEN ? 'true' : 'false'"
          :class="['valg__rad', { 'valg__rad--pa': valgtISteg1 === INGEN }]"
          @click="nyttValg = INGEN"
        >
          <span class="valg__tekst"><strong>Uten trening</strong><span>Kamp eller cup</span></span>
          <span class="valg__radio" aria-hidden="true" />
        </button>
      </div>
      <div class="del__fot"><div class="del__fot-inn">
        <button type="button" class="del__hoved" @click="nesteFraTrening">Neste</button>
      </div></div>
    </section>

    <!-- ── 2. OPPMØTE ───────────────────────────────────────────── -->
    <section v-else-if="steg === 'oppmote'" class="del__side">
      <h1 class="del__h1">Hvem er her?</h1>
      <p class="del__teller"><strong>{{ her.length }}</strong> av {{ players.length + gjester.length }}</p>
      <OppmoteGrid
        :spillere="sortert"
        :navn="navn"
        :trener-navn="{}"
        :er-her="erHer"
        :trener-her="() => false"
        :rigger-valg="false"
        @spiller="vekslSpiller"
      />

      <h2 class="ds-eyebrow del__eyebrow">Gjester</h2>
      <div class="gjest">
        <span v-for="g in gjester" :key="g.id" class="gjest__brikke">
          <span class="gjest__niva">{{ g.niva || '–' }}</span>
          {{ g.navn }}
          <button type="button" class="gjest__fjern" :aria-label="`Fjern ${g.navn}`" @click="fjernGjest(g.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
          </button>
        </span>
        <button type="button" class="gjest__apne" @click="visGjest = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Legg til gjest
        </button>
      </div>

      <div class="del__fot"><div class="del__fot-inn">
        <button type="button" class="del__hoved" :disabled="!her.length" @click="tilInndeling">Del inn</button>
      </div></div>
    </section>

    <!-- ── 3. INNDELING ─────────────────────────────────────────── -->
    <section v-else class="del__side del__side--inndeling">
      <button type="button" class="del__oppsummering" @click="gaTil('oppmote')">
        <span class="del__opps-tekst">
          <strong>{{ oktNavn }}</strong>
          <span>{{ her.length }} {{ her.length === 1 ? 'spiller' : 'spillere' }}</span>
        </span>
        <span class="del__endre">Endre</span>
      </button>

      <div class="del__fane" role="tablist" aria-label="Grupper eller lag">
        <button type="button" role="tab" :class="['del__fane-knapp', { 'del__fane-knapp--aktiv': form === 'grupper' }]" :aria-selected="form === 'grupper' ? 'true' : 'false'" @click="velgForm('grupper')">Grupper</button>
        <button type="button" role="tab" :class="['del__fane-knapp', { 'del__fane-knapp--aktiv': form === 'lag' }]" :aria-selected="form === 'lag' ? 'true' : 'false'" @click="velgForm('lag')">Lag</button>
      </div>

      <div class="del__styr">
        <div class="del__seg" role="group" aria-label="Nivå">
          <button type="button" :class="['del__seg-knapp', { 'del__seg-knapp--pa': v.type === 'diff' }]" :aria-pressed="v.type === 'diff' ? 'true' : 'false'" @click="velgType('diff')">Diff</button>
          <button type="button" :class="['del__seg-knapp', { 'del__seg-knapp--pa': v.type === 'mix' }]" :aria-pressed="v.type === 'mix' ? 'true' : 'false'" @click="velgType('mix')">Mix</button>
        </div>
        <Steg :verdi="resultat.antall" :min="min" :maks="maks" :navn="form === 'lag' ? 'Antall lag' : 'Antall grupper'" @endre="velgAntall" />
      </div>

      <button v-if="form === 'grupper' && v.type === 'diff'" type="button" role="switch" class="del__bryter" :aria-checked="likeStore ? 'true' : 'false'" @click="vekslLikeStore">
        <span>Like store grupper</span>
        <span :class="['bryter', { 'bryter--pa': likeStore }]" aria-hidden="true"><span class="bryter__knott" /></span>
      </button>

      <p v-if="endretAvAnnen" class="del__linje" aria-live="polite">
        <span v-if="endretAvAnnen" class="del__delt">{{ endretAvAnnen }}</span>
      </p>

      <p v-if="!her.length" class="del__tom">Ingen er med.</p>

      <div v-else-if="form === 'grupper'" class="kortene">
        <div v-for="(e, i) in resultat.enheter" :key="e.id" class="kort">
          <div class="kort__hode">
            <span v-if="resultat.type === 'diff' && e.nivaer.length" class="kort__niva" :aria-label="`Nivå ${e.navn}`">{{ e.nivaer.join('') }}</span>
            <span class="kort__tittel">
              {{ resultat.type === 'diff' ? `Gruppe ${i + 1}` : e.navn }}
            </span>
            <span class="kort__ant">{{ e.spillere.length }}</span>
          </div>
          <p class="kort__navn"><span v-for="(id, ni) in sorterNavn(e.spillere)" :key="id" class="kort__ett">{{ navn[id] }}<span v-if="gjestIder.has(id)" class="kort__gjest"> gjest</span><template v-if="ni < e.spillere.length - 1">&nbsp;·</template></span></p>
        </div>
      </div>

      <div v-else class="kortene">
        <div v-for="(b, bi) in resultat.baner" :key="bi" class="bane">
          <p class="bane__hode">
            <strong>Bane {{ bi + 1 }}</strong>
          </p>
          <div class="kortene">
            <div v-for="li in b.lag" :key="li" class="kort" :data-farge="resultat.enheter[li].navn">
              <div class="kort__hode">
                <span class="kort__vest" aria-hidden="true" />
                <span class="kort__tittel">{{ resultat.enheter[li].navn }}</span>
                <span class="kort__ant">{{ resultat.enheter[li].spillere.length }}</span>
              </div>
              <p class="kort__navn"><span v-for="(id, ni) in sorterNavn(resultat.enheter[li].spillere)" :key="id" class="kort__ett">{{ navn[id] }}<span v-if="gjestIder.has(id)" class="kort__gjest"> gjest</span><template v-if="ni < resultat.enheter[li].spillere.length - 1">&nbsp;·</template></span></p>
            </div>
          </div>
        </div>
      </div>

      <!-- Sjelden brukt: en rolig knapp under gruppene, ikke en hovedknapp.
           Bare på Mix: på Diff bestemmer nivået gruppene. -->
      <button v-if="her.length && v.type === 'mix'" type="button" class="del__trekk" @click="trekkPaNytt">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
        Trekk på nytt
      </button>
    </section>

    <Sheet :show="visGjest" title="Ny gjest" @close="visGjest = false">
      <form class="gjest__ny" @submit.prevent="leggTilGjest">
        <input v-model="nyGjest.navn" class="ds-input gjest__input" type="text" placeholder="Navn" aria-label="Navn på gjesten" autocomplete="off" enterkeyhint="done" />
        <p class="ds-eyebrow del__eyebrow del__eyebrow--tett">Nivå</p>
        <div class="del__seg del__seg--bred" role="group" aria-label="Nivå">
          <button v-for="n in ['A', 'B', 'C']" :key="n" type="button" :class="['del__seg-knapp', { 'del__seg-knapp--pa': nyGjest.niva === n }]" :aria-pressed="nyGjest.niva === n ? 'true' : 'false'" @click="nyGjest.niva = n">{{ n }}</button>
        </div>
      </form>
      <template #footer>
        <button type="button" class="del__hoved" :disabled="!nyGjest.navn.trim()" @click="leggTilGjest">Legg til</button>
      </template>
    </Sheet>

    <Sheet :show="visMeny" title="Start på nytt?" @close="visMeny = false">
      <template #footer>
        <button type="button" class="del__hoved del__hoved--fare" @click="nullstill">Start på nytt</button>
      </template>
    </Sheet>
  </div>
</template>

<style scoped>
.del {
  min-height: 100vh;
  background: var(--ds-color-bg);
  padding-bottom: calc(170px + env(safe-area-inset-bottom, 0px));
}
.del__bar {
  display: flex; align-items: center; gap: var(--ds-space-md);
  max-width: 600px; margin: 0 auto;
  padding: var(--ds-space-sm) var(--ds-space-md);
  position: sticky; top: 0; z-index: var(--ds-z-sticky);
  background: var(--ds-color-bg);
}
.del__ikonknapp {
  flex: none; display: grid; place-items: center; width: 44px; height: 44px;
  border: none; border-radius: 50%; background: transparent;
  color: var(--ds-color-text-primary); cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.del__ikonknapp:active { background: var(--ds-color-bg-hover); }
.del__ikonknapp svg { width: 22px; height: 22px; }
.del__ikonknapp--tom { pointer-events: none; }
.del__framdrift { flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.del__strek { height: 4px; border-radius: 2px; background: var(--ds-color-border); transition: background-color .25s ease; }
.del__strek--pa { background: var(--ds-color-text-primary); }

.del__tom { padding: var(--ds-space-xl) var(--ds-space-lg); text-align: center; color: var(--ds-color-text-tertiary); }
.del__side { max-width: 560px; margin: 0 auto; padding: var(--ds-space-md) var(--ds-space-lg) 0; }
.del__h1 {
  margin: 0 0 var(--ds-space-lg);
  font-size: 28px; line-height: 1.15; font-weight: var(--ds-weight-bold);
  letter-spacing: -0.01em; color: var(--ds-color-text-primary);
}
.del__h2 { margin: var(--ds-space-xl) 0 var(--ds-space-sm); font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.del__teller { margin: calc(-1 * var(--ds-space-md)) 0 var(--ds-space-lg); font-size: var(--ds-text-md); color: var(--ds-color-text-secondary); font-variant-numeric: tabular-nums; }
.del__teller strong { color: var(--ds-color-text-primary); }

/* Steg 1: store radiorader, som et Airbnb-valg. */
.valg { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
.valg__rad {
  display: flex; align-items: center; gap: var(--ds-space-md);
  min-height: 72px; padding: var(--ds-space-md) var(--ds-space-lg);
  border: 1.5px solid var(--ds-color-border); border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  text-align: left; cursor: pointer;
  transition: border-color .15s ease, box-shadow .15s ease;
  -webkit-tap-highlight-color: transparent;
}
.valg__rad--pa { border-color: var(--ds-color-text-primary); box-shadow: inset 0 0 0 1px var(--ds-color-text-primary); }
.valg__tekst { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.valg__tekst strong { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.valg__tekst span { font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.valg__radio {
  flex: none; width: 22px; height: 22px; border-radius: 50%;
  border: 1.5px solid var(--ds-color-border);
  transition: border-width .15s ease, border-color .15s ease;
}
.valg__rad--pa .valg__radio { border: 7px solid var(--ds-color-text-primary); }

/* Fast bunn med én hovedknapp, over bunnmenyen. */
.del__fot {
  position: fixed; left: 0; right: 0;
  bottom: calc(65px + env(safe-area-inset-bottom, 0px));
  z-index: calc(var(--ds-z-sticky) - 1);
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: var(--ds-color-bg);
  border-top: 1px solid var(--ds-color-border-light, var(--ds-color-border));
}
@media (min-width: 768px) { .del__fot { bottom: 0; } }
.del__fot-inn { max-width: 560px; margin: 0 auto; }
.del__hoved {
  display: block; width: 100%;
  min-height: var(--ds-btn-h-lg, 52px);
  border: none; border-radius: var(--ds-radius-lg);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.del__hoved:disabled { opacity: .4; cursor: default; }
.del__sekundar {
  display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
  min-height: var(--ds-btn-h-lg, 52px);
  border: 1.5px solid var(--ds-color-text-primary); border-radius: var(--ds-radius-lg);
  background: transparent; color: var(--ds-color-text-primary);
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.del__sekundar svg { width: 18px; height: 18px; }

/* Steg 2: gjester */
.gjest { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
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
.gjest__apne {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 var(--ds-space-lg);
  border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary);
  cursor: pointer;
}
.gjest__apne svg { width: 16px; height: 16px; }
.gjest__ny { display: flex; flex-direction: column; gap: var(--ds-space-md); }
.gjest__input { min-height: 52px; font-size: var(--ds-text-md); }

/* Steg 3 */
.del__oppsummering {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  width: 100%; min-height: 56px; margin-bottom: var(--ds-space-md); padding: 0 var(--ds-space-lg);
  border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-md); color: var(--ds-color-text-secondary); text-align: left;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.del__opps-tekst { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; }
.del__opps-tekst strong { font-size: var(--ds-text-md); color: var(--ds-color-text-primary); font-weight: var(--ds-weight-semibold); }
.del__opps-tekst span { font-size: var(--ds-text-sm); }
.del__endre { flex: none; font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); text-decoration: underline; text-underline-offset: 3px; }

.del__fane {
  display: grid; grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--ds-color-border);
}
.del__fane-knapp {
  position: relative; min-height: 48px;
  border: 0; background: transparent;
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-tertiary);
  cursor: pointer;
  transition: color .15s ease;
  -webkit-tap-highlight-color: transparent;
}
.del__fane-knapp::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px;
  background: var(--ds-color-text-primary);
  transform: scaleX(0); transition: transform .2s ease;
}
.del__fane-knapp--aktiv { color: var(--ds-color-text-primary); }
.del__fane-knapp--aktiv::after { transform: scaleX(1); }

.del__styr { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md); margin-top: var(--ds-space-lg); }
.del__seg { display: inline-grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 0; padding: 3px; border-radius: var(--ds-radius-full); background: var(--ds-color-bg-subtle, var(--ds-color-bg-elevated)); }
.del__seg--bred { display: grid; }
.del__seg-knapp {
  min-height: 42px; min-width: 64px; padding: 0 16px;
  border: 0; border-radius: var(--ds-radius-full); background: transparent;
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-secondary);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: background-color .15s ease, color .15s ease;
}
.del__seg-knapp--pa { background: var(--ds-color-accent); color: var(--ds-color-accent-text); }

.del__bryter {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  width: 100%; min-height: 52px; margin-top: var(--ds-space-sm); padding: 0;
  border: 0; background: transparent; text-align: left;
  font-size: var(--ds-text-md); color: var(--ds-color-text-primary);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.bryter { position: relative; flex: none; width: 50px; height: 30px; border-radius: 15px; background: var(--ds-color-border); transition: background-color .2s ease; }
.bryter--pa { background: var(--ds-color-accent); }
.bryter__knott { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .25); transition: transform .2s ease; }
.bryter--pa .bryter__knott { transform: translateX(20px); }

.del__linje {
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px var(--ds-space-md);
  margin: var(--ds-space-sm) 0 0;
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
}
.del__delt { margin-left: auto; }

.kortene { display: flex; flex-direction: column; gap: var(--ds-space-sm); padding-top: var(--ds-space-md); }
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
  background: var(--ds-color-bg-subtle);
  font-size: var(--ds-text-xs, 12px); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}
.kort__ant { margin-left: auto; flex: none; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); font-variant-numeric: tabular-nums; }
.kort__navn { margin: var(--ds-space-sm) 0 0; font-size: var(--ds-text-md); line-height: 1.6; color: var(--ds-color-text-primary); }
.kort__ett { display: inline-block; white-space: nowrap; margin-right: .35em; }
.del__eyebrow { margin: var(--ds-space-xl) 0 var(--ds-space-sm); }
.del__eyebrow--tett { margin: 0 0 calc(-1 * var(--ds-space-sm)); }
.del__trekk {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; min-height: 48px; margin-top: var(--ds-space-md);
  border: 0; background: transparent;
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.del__trekk:active { color: var(--ds-color-text-primary); }
.del__trekk svg { width: 18px; height: 18px; }
.del__hoved--fare { background: var(--ds-color-error, #C0392B); color: #fff; }
.kort__gjest { font-size: var(--ds-text-xs); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-tertiary); }

.meny__rad {
  display: block; width: 100%; min-height: 56px; padding: 0;
  border: 0; border-bottom: 1px solid var(--ds-color-border-light, var(--ds-color-border));
  background: transparent; text-align: left;
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-medium, 500); color: var(--ds-color-text-primary);
  cursor: pointer;
}
.meny__rad:last-child { border-bottom: 0; }
.meny__rad--fare { color: var(--ds-color-error, #C0392B); }
</style>
