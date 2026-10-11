<script setup>
// DEL INN — grupper eller lag på sekunder, når som helst.
//
// Fritt verktøy fra Hjem: kampoppvarming, cup, eller når planen ikke passer.
// Samme motor som kjøreplanen (lib/grupper → delInn), så det som vises her er
// det samme kjøreplanen ville laget.
//
// Hvem som er med: dagens oppmøte hvis det er lagret, ellers hele kullet.
// Endringer her er bare på denne telefonen. Ingenting lagres, med mindre det
// er trening i dag og du trykker «Bruk som dagens grupper/lag». Da byttes den
// ene delen av planen, hos alle trenerne, og kan angres.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTrainingWeek } from '../composables/useTrainingWeek'
import { useExercises, resolveDrills } from '../composables/useExercises'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerLevels } from '../composables/usePlayerLevels'
import { useCoaches } from '../composables/useCoaches'
import { useTreningsOkt, hentDagensOppmote } from '../composables/useTreningsOkt'
import { useToast } from '../composables/useToast'
import { useAuth } from '../stores/auth'
import { delInn, kortnavn, ovelseNokkel } from '../lib/grupper'
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
const baseTrenere = computed(() => new Set(dagensRun.value ? dagensRun.value.trenere.filter(id => id !== rigger.value) : coaches.value.map(c => c.id)))
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
const resultat = computed(() => delInn({
  spillere: her.value,
  trenere: trenere.value,
  form: form.value,
  type: v.value.type,
  antall: v.value.antall,
  runde: dagensRun.value?.state?._runde || 0,
  seed: v.value.seed + (dagensRun.value?.state?._runde || 0),
  drill: form.value === 'lag' ? forsteMix.value : null
}))
const min = computed(() => (form.value === 'lag' ? 2 : 1))
const maks = computed(() => Math.max(min.value, Math.min(6, form.value === 'lag' ? Math.floor(her.value.length / 2) : her.value.length)))
function velgType(t) { sett({ type: t, antall: null }) }
function velgAntall(n) { sett({ antall: n }) }
function trekkPaNytt() {
  sett({ seed: v.value.seed + 1 })
  meldEvent('del_inn_trukket', { form: form.value })
}

// ── Bruk som dagens … ───────────────────────────────────────────────────────
// Bare når det er trening i dag og oppmøtet er lagret. Den ene delen byttes;
// den andre står urørt. Ingen dialog — «Angre» i meldingen etterpå.
const kanBruke = computed(() => !!dagensRun.value && !!her.value.length)
const knappTekst = computed(() => (form.value === 'lag' ? 'Bruk som dagens lag' : 'Bruk som dagens grupper'))
async function bruk() {
  const r = dagensRun.value
  if (!r) return
  const st = r.state || {}
  const hva = form.value
  const res = resultat.value
  const endret = { ...(st._endret || {}), [hva]: { tid: new Date().toISOString(), av: coach.value?.id || null, navn: coach.value?.name || null } }
  const forrige = { _endret: st._endret ?? null }
  if (hva === 'grupper') {
    forrige._gjenger = st._gjenger ?? null
    const teller = {}
    const gjenger = res.enheter.map(e => {
      const nivaer = res.type === 'diff' ? e.nivaer : []
      const k = nivaer.join('') || 'G'
      teller[k] = (teller[k] || 0) + 1
      return { id: k + teller[k], nivaer, spillere: e.spillere, trenere: e.trenere }
    })
    await okt.settInngrep('_gjenger', gjenger)
  } else {
    forrige._lag = st._lag ?? null
    forrige._antall = st._antall ?? null
    const n = res.antall
    const antall = { ...(st._antall || {}) }
    drills.value.forEach((d, i) => { if (d.type === 'mix') antall[ovelseNokkel(i, d)] = n })
    await okt.settInngrep('_lag', { ...(st._lag || {}), [n]: res.enheter.map(e => e.spillere) })
    await okt.settInngrep('_antall', antall)
  }
  await okt.settInngrep('_endret', endret)
  meldEvent('del_inn_brukt', { form: hva, type: res.type, antall: res.antall })
  router.push(`/trening/okt/${r.session_id}#${hva}`)
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
        <strong>{{ her.length }}</strong> {{ her.length === 1 ? 'spiller' : 'spillere' }} · <strong>{{ trenere.length }}</strong> {{ trenere.length === 1 ? 'trener' : 'trenere' }}
      </button>
    </header>

    <p v-if="!isCoach" class="del__tom">Del inn er for trenerne.</p>
    <p v-else-if="!klar" class="del__tom">Laster …</p>

    <template v-else>
      <div class="del__styr">
        <div class="seg" role="group" aria-label="Grupper eller lag">
          <button type="button" class="seg__knapp" :aria-pressed="form === 'grupper' ? 'true' : 'false'" @click="form = 'grupper'">Grupper</button>
          <button type="button" class="seg__knapp" :aria-pressed="form === 'lag' ? 'true' : 'false'" @click="form = 'lag'">Lag</button>
        </div>
        <div class="del__rad">
          <div class="seg seg--liten" role="group" aria-label="Nivå">
            <button type="button" class="seg__knapp" :aria-pressed="v.type === 'diff' ? 'true' : 'false'" @click="velgType('diff')">Diff</button>
            <button type="button" class="seg__knapp" :aria-pressed="v.type === 'mix' ? 'true' : 'false'" @click="velgType('mix')">Mix</button>
          </div>
          <Steg :verdi="resultat.antall" :min="min" :maks="maks" :navn="form === 'lag' ? 'Antall lag' : 'Antall grupper'" @endre="velgAntall" />
        </div>
      </div>

      <div class="del__info">
        <span>{{ resultat.info }}</span>
        <button v-if="form === 'lag'" type="button" class="del__trekk" @click="trekkPaNytt">Trekk på nytt</button>
      </div>

      <p v-if="!her.length" class="del__tom">Ingen er med. Trykk på antallet øverst for å velge hvem.</p>

      <div v-else-if="form === 'grupper'" class="kortene">
        <div v-for="e in resultat.enheter" :key="e.id" class="kort">
          <div class="kort__hode">
            <span v-if="resultat.type === 'diff' && e.nivaer.length" class="kort__niva" :aria-label="`Nivå ${e.navn}`">{{ e.nivaer.join('') }}</span>
            <span class="kort__tittel">
              <template v-if="resultat.type === 'diff'">{{ navnPa(e.trenere) || 'Ingen trener' }}</template>
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

      <div v-if="kanBruke" class="del__fot">
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
  min-height: 44px; padding: 0 4px;
  border: 0; background: none;
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
  cursor: pointer;
}
.del__her strong { color: var(--ds-color-text-primary); font-variant-numeric: tabular-nums; }
.del__tom { padding: var(--ds-space-xl) var(--ds-space-lg); text-align: center; color: var(--ds-color-text-tertiary); }

.del__styr, .del__info, .kortene { max-width: 560px; margin-left: auto; margin-right: auto; }
.del__styr {
  padding: var(--ds-space-xs) var(--ds-space-lg) var(--ds-space-md);
  border-bottom: 1px solid var(--ds-color-border-light, var(--ds-color-border));
}
.del__rad { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md); margin-top: var(--ds-space-md); }

.seg {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px;
  padding: 4px;
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-subtle, var(--ds-color-bg-elevated));
}
.seg__knapp {
  min-height: 44px; padding: 0 16px;
  border: 0; border-radius: var(--ds-radius-md, 10px);
  background: transparent;
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.seg__knapp[aria-pressed="true"] {
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  font-weight: var(--ds-weight-semibold);
  box-shadow: var(--ds-shadow-sm, 0 1px 2px rgba(15, 15, 15, .08));
}
/* Mørkt: det hevede feltet er mørkere enn sporet, så den valgte fanen
   druknet. Lysere flate gjør valget tydelig. */
:global([data-theme="dark"]) .seg__knapp[aria-pressed="true"] { background: var(--ds-color-bg-hover); }
.seg--liten { display: inline-grid; }
.seg--liten .seg__knapp { min-height: 40px; font-size: var(--ds-text-sm); }

.del__info {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  min-height: 44px;
  padding: var(--ds-space-sm) var(--ds-space-lg) 0;
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
}
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
