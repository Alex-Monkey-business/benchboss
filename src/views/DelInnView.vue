<script setup>
// DEL INN — grupper eller lag på sekunder, når som helst.
//
// Fritt verktøy fra Hjem: kampoppvarming, cup, eller når planen ikke passer.
// Samme motor som kjøreplanen (lib/grupper → delInn), så det som vises her er
// det samme kjøreplanen ville laget.
//
// Hvem som er med: dagens oppmøte hvis det er lagret, ellers hele kullet.
// Endringer her er bare på denne telefonen. Ingenting lagres, med mindre det
// er trening i dag. Er oppmøtet ikke telt ennå, starter «Start dagens
// trening med disse» økta med dem som er med og denne inndelingen. Er det
// telt, bytter «Bruk som dagens grupper/lag» den ene delen av planen, hos alle
// trenerne, og kan angres.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTrainingWeek } from '../composables/useTrainingWeek'
import { useExercises, resolveDrills } from '../composables/useExercises'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerLevels } from '../composables/usePlayerLevels'
import { useCoaches } from '../composables/useCoaches'
import { useTreningsOkt, hentDagensOppmote, erTreningsdag } from '../composables/useTreningsOkt'
import { useToast } from '../composables/useToast'
import { useAuth } from '../stores/auth'
import { delInn, kortnavn, ovelseNokkel, lagGjenger, trekkLag, antallLag } from '../lib/grupper'
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
const toast = useToast()

// Dagens trening: den med dagens ukedag. Har flere den, vinner den som har
// oppmøtet lagret.
const idag = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d })()
const lagretIdag = ref(null) // null = ikke hentet ennå
const session = computed(() => {
  if (!lagretIdag.value) return null
  const dagens = days.value.filter(s => s.weekday === idag)
  return dagens.find(s => s.id in lagretIdag.value) || dagens[0] || null
})
const drills = computed(() => (session.value ? resolveDrills(session.value.drills, exercises.value) : []))
const dagensRun = computed(() => (run.value && !run.value.lokal && session.value && run.value.session_id === session.value.id ? run.value : null))
// Klar når vi vet hvem som er med: ellers blinker hele kullet før dagens
// oppmøte kommer.
const klar = computed(() => !!players.value.length && !!lagretIdag.value && (!session.value || okt.lastet.value))
const rigger = computed(() => dagensRun.value?.state?._rigger || null)

const navn = computed(() => kortnavn(players.value))
const trenerNavn = computed(() => kortnavn(coaches.value))
const navnPa = ids => {
  const n = ids.map(id => trenerNavn.value[id]).filter(Boolean)
  return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} og ${n[n.length - 1]}`
}

// ── Hvem er med ─────────────────────────────────────────────────────────────
// Utgangspunktet er dagens oppmøte (uten riggeren), ellers alle. Det du
// trykker her, legger seg oppå og gjelder bare denne telefonen.
const spillerValg = ref({})
const trenerValg = ref({})
const baseSpillere = computed(() => new Set(dagensRun.value ? dagensRun.value.spillere : players.value.map(p => p.id)))
// Trenerne er valgfrie: på treningsdagen er det de som er telt opp, ellers
// ingen. Antall grupper følger spillerne uansett.
const baseTrenere = computed(() => new Set(dagensRun.value ? dagensRun.value.trenere.filter(id => id !== rigger.value) : []))
const erHer = id => (id in spillerValg.value ? spillerValg.value[id] : baseSpillere.value.has(id))
const trenerHer = id => (id in trenerValg.value ? trenerValg.value[id] : baseTrenere.value.has(id))
const sortert = computed(() => [...players.value].sort((a, b) => a.name.localeCompare(b.name, 'no')))
const her = computed(() => players.value.filter(p => erHer(p.id)).map(p => ({ id: p.id, niva: levelFor(p.id) })))
const trenere = computed(() => coaches.value.filter(c => trenerHer(c.id)).map(c => c.id))
const visOppmote = ref(false)
function vekslSpiller(id) { spillerValg.value = { ...spillerValg.value, [id]: !erHer(id) } }
function vekslTrener(id) { trenerValg.value = { ...trenerValg.value, [id]: !trenerHer(id) } }

// ── Valgene ─────────────────────────────────────────────────────────────────
// Hver fane husker sitt: type, antall (null = regnet ut) og frø.
const form = ref('grupper')
const valg = ref({
  grupper: { type: 'diff', antall: null, seed: 1 },
  lag: { type: 'mix', antall: null, seed: 1 }
})
const v = computed(() => valg.value[form.value])
function sett(endring) {
  valg.value = { ...valg.value, [form.value]: { ...v.value, ...endring } }
}
const forsteMix = computed(() => drills.value.find(d => d.type === 'mix') || null)
const innData = computed(() => ({
  spillere: her.value,
  trenere: trenere.value,
  form: form.value,
  type: v.value.type,
  antall: v.value.antall,
  runde: dagensRun.value?.state?._runde || 0,
  seed: v.value.seed + (dagensRun.value?.state?._runde || 0),
  drill: form.value === 'lag' ? forsteMix.value : null
}))
const resultat = computed(() => delInn(innData.value))
const min = computed(() => (form.value === 'lag' ? 2 : 1))
const maks = computed(() => Math.max(min.value, Math.min(6, form.value === 'lag' ? Math.floor(her.value.length / 2) : her.value.length)))
function velgType(t) { sett({ type: t, antall: null }) }
function velgAntall(n) { sett({ antall: n }) }
function trekkPaNytt() {
  sett({ seed: v.value.seed + 1 })
  meldEvent('del_inn_trukket', { form: form.value })
}

// ── Til dagens trening ──────────────────────────────────────────────────────
// Er oppmøtet telt, byttes den ene delen av planen; den andre står urørt.
// Ingen dialog — «Angre» i meldingen etterpå. Er det ikke telt ennå, starter
// knappen økta med dem som er med her og denne inndelingen.
const kanBruke = computed(() => !!dagensRun.value && !!her.value.length)
const kanStarte = computed(() => !dagensRun.value && !!session.value && erTreningsdag(session.value) && !!her.value.length)
const knappTekst = computed(() => (kanStarte.value
  ? 'Start dagens trening med disse'
  : form.value === 'lag' ? 'Bruk som dagens lag' : 'Bruk som dagens grupper'))

// Del inn-gruppene slik kjøreplanen lagrer dem.
function somGjenger(res) {
  const teller = {}
  return res.enheter.map(e => {
    const nivaer = res.type === 'diff' ? e.nivaer : []
    const k = nivaer.join('') || 'G'
    teller[k] = (teller[k] || 0) + 1
    return { id: k + teller[k], nivaer, spillere: e.spillere, trenere: e.trenere }
  })
}
// Antall lag på hver mix-øvelse satt til det valgte.
function antallPaMix(fra, n) {
  const antall = { ...(fra || {}) }
  drills.value.forEach((d, i) => { if (d.type === 'mix') antall[ovelseNokkel(i, d)] = n })
  return antall
}

// Ett trykk er ett bytte: et dobbelttrykk skal ikke gi to meldinger og
// to steg i historikken.
let bruker = false
async function bruk() {
  if (kanStarte.value) return start()
  const r = dagensRun.value
  if (!r || bruker) return
  bruker = true
  const st = r.state || {}
  const hva = form.value
  const res = resultat.value
  const endret = { ...(st._endret || {}), [hva]: { tid: new Date().toISOString(), av: coach.value?.id || null, navn: coach.value?.name || null } }
  const forrige = { _endret: st._endret ?? null }
  if (hva === 'grupper') {
    forrige._gjenger = st._gjenger ?? null
    await okt.settInngrep('_gjenger', somGjenger(res))
  } else {
    forrige._lag = st._lag ?? null
    forrige._antall = st._antall ?? null
    const n = res.antall
    await okt.settInngrep('_lag', { ...(st._lag || {}), [n]: res.enheter.map(e => e.spillere) })
    await okt.settInngrep('_antall', antallPaMix(st._antall, n))
  }
  await okt.settInngrep('_endret', endret)
  meldEvent('del_inn_brukt', { form: hva, type: res.type, antall: res.antall })
  await router.push(`/trening/okt/${r.session_id}#${hva}`)
  bruker = false
  toast.show(hva === 'lag' ? 'Dagens lag er byttet' : 'Dagens grupper er byttet', 'success', 6000, {
    action: {
      label: 'Angre',
      handler: async () => {
        if (run.value?.id !== r.id) return
        for (const [k, val] of Object.entries(forrige)) await okt.settInngrep(k, val)
        meldEvent('del_inn_angret', { form: hva })
      }
    }
  })
}

// Oppmøtet lagres med dem som er med her. Den delen du ser, er din
// inndeling; den andre lages som i opptellingen. Trenerrotasjonen er først
// kjent når økta lagres, så gruppene regnes på nytt med den.
async function start() {
  const s = session.value
  if (!s || bruker) return
  bruker = true
  const hva = form.value
  const sp = her.value.map(p => p.id)
  const tr = [...trenere.value]
  const harDiff = drills.value.some(d => d.type === 'diff')
  const mix = drills.value.filter(d => d.type === 'mix')
  const plan = runde => {
    const res = delInn({ ...innData.value, runde, seed: v.value.seed + runde })
    const ut = {}
    if (hva === 'grupper') {
      ut._gjenger = somGjenger(res)
      const tall = [...new Set(mix.map(d => antallLag(d, sp.length)))]
      if (tall.length) ut._lag = Object.fromEntries(tall.map(n => [n, trekkLag(her.value, n, runde + 1)]))
    } else {
      if (harDiff) ut._gjenger = lagGjenger(her.value, tr, runde, runde + 1)
      ut._lag = { [res.antall]: res.enheter.map(e => e.spillere) }
      ut._antall = antallPaMix(null, res.antall)
    }
    return ut
  }
  const ok = await okt.start(s, sp, tr, null, plan)
  bruker = false
  if (!ok) { toast.show('Fikk ikke lagret oppmøtet. Prøv igjen.', 'error'); return }
  meldEvent('del_inn_startet', { form: hva, spillere: sp.length, trenere: tr.length })
  await router.push(`/trening/okt/${s.id}#${hva}`)
}

let stopp = null
watch(session, s => {
  stopp?.()
  stopp = s ? okt.folg(s) : null
}, { immediate: true })
onMounted(() => {
  hentDagensOppmote().then(m => { lagretIdag.value = m || {} })
  fetchWeek()
  fetchExercises()
  fetchPlayers()
  fetchPlayerLevels()
  fetchCoaches()
  meldEvent('del_inn_apnet')
})
onUnmounted(() => stopp?.())

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
      <button v-if="isCoach" type="button" class="del__her" @click="visOppmote = true">
        <svg class="del__her-ikon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3.2 3.2 0 0 1 0 6.3" /><path d="M18 14.3c1.8.8 3 2.6 3 4.7" /></svg>
        <span><strong>{{ her.length }}</strong> {{ her.length === 1 ? 'spiller' : 'spillere' }}<template v-if="trenere.length"> · <strong>{{ trenere.length }}</strong> {{ trenere.length === 1 ? 'trener' : 'trenere' }}</template></span>
        <svg class="del__her-pil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
    </header>

    <p v-if="!isCoach" class="del__tom">Del inn er for trenerne.</p>
    <p v-else-if="!klar" class="del__tom">Laster …</p>

    <template v-else>
      <div class="del__styr">
        <div class="del__rad">
          <div class="ds-pills" role="group" aria-label="Grupper eller lag">
            <button type="button" :class="['ds-pill', 'seg__knapp', { 'ds-pill--active': form === 'grupper' }]" :aria-pressed="form === 'grupper' ? 'true' : 'false'" @click="form = 'grupper'">Grupper</button>
            <button type="button" :class="['ds-pill', 'seg__knapp', { 'ds-pill--active': form === 'lag' }]" :aria-pressed="form === 'lag' ? 'true' : 'false'" @click="form = 'lag'">Lag</button>
          </div>
          <div class="ds-pills" role="group" aria-label="Nivå">
            <button type="button" :class="['ds-pill', 'seg__knapp', { 'ds-pill--active': v.type === 'diff' }]" :aria-pressed="v.type === 'diff' ? 'true' : 'false'" @click="velgType('diff')">Diff</button>
            <button type="button" :class="['ds-pill', 'seg__knapp', { 'ds-pill--active': v.type === 'mix' }]" :aria-pressed="v.type === 'mix' ? 'true' : 'false'" @click="velgType('mix')">Mix</button>
          </div>
        </div>
        <div class="del__rad">
          <Steg :verdi="resultat.antall" :min="min" :maks="maks" :navn="form === 'lag' ? 'Antall lag' : 'Antall grupper'" @endre="velgAntall" />
          <button v-if="form === 'lag'" type="button" class="del__trekk" @click="trekkPaNytt">Trekk på nytt</button>
          <span v-else-if="resultat.info" class="del__info">{{ resultat.info }}</span>
        </div>
        <p v-if="form === 'lag' && resultat.info" class="del__info del__info--under">{{ resultat.info }}</p>
      </div>

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
          <p class="kort__navn">{{ e.spillere.map(id => navn[id]).join(' · ') }}</p>
        </div>
      </div>

      <div v-else class="kortene">
        <div v-for="(b, bi) in resultat.baner" :key="bi" class="bane">
          <p class="bane__hode">
            <strong>Bane {{ bi + 1 }}</strong>
            <span v-if="b.trenere.length">{{ navnPa(b.trenere) }}</span>
          </p>
          <div class="kortene">
            <div v-for="li in b.lag" :key="li" class="kort">
              <div class="kort__hode">
                <span class="kort__tittel">{{ resultat.enheter[li].navn }}</span>
                <span v-if="b.pluss === li" class="kort__pluss">+ trener</span>
                <span class="kort__ant">{{ resultat.enheter[li].spillere.length }}</span>
              </div>
              <p class="kort__navn">{{ resultat.enheter[li].spillere.map(id => navn[id]).join(' · ') }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="kanBruke || kanStarte" class="del__fot">
        <div class="del__fot-inn">
          <button type="button" class="del__bruk" @click="bruk">{{ knappTekst }}</button>
        </div>
      </div>
    </template>

    <Sheet :show="visOppmote" title="Hvem er med?" tall @close="visOppmote = false">
      <p class="del__teller"><strong>{{ her.length }}</strong> av {{ players.length }}</p>
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
  padding-bottom: calc(180px + env(safe-area-inset-bottom, 0px));
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
.del__rad + .del__rad { margin-top: var(--ds-space-md); }

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

.kortene { display: flex; flex-direction: column; gap: var(--ds-space-sm); padding: var(--ds-space-sm) var(--ds-space-lg) 0; }
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
  background: var(--ds-color-bg-subtle, var(--ds-color-bg-elevated));
}
.kort__hode { display: flex; align-items: center; gap: var(--ds-space-md); }
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

.del__fot {
  position: fixed; left: 0; right: 0;
  bottom: calc(65px + env(safe-area-inset-bottom, 0px));
  z-index: calc(var(--ds-z-sticky) - 1);
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: var(--ds-color-bg);
  border-top: 1px solid var(--ds-color-border-light, var(--ds-color-border));
}
.del__fot-inn { max-width: 560px; margin: 0 auto; }
@media (min-width: 768px) { .del__fot { bottom: 0; } }
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
</style>
