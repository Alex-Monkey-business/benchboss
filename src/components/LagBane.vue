<script setup>
// Ett lag på banen. Appen plasserer spillerne ut fra posisjonene deres
// (lib/oppstilling), treneren justerer: trykk på en spiller, så på en annen,
// så bytter de. Fra benken inn fungerer likt. Justeringene deles mellom
// trenerne (useOppstilling) og gjelder per spillform.
//
// Lagfargen kommer fra kortet rundt (--accent-text), så banen er lik for
// alle lag og drakta er lagets.
import { computed, ref } from 'vue'
import { formationFor } from '../lib/formations'
import { positionForSlot, positionShort, positionLabel } from '../lib/playerPositions'
import { plasserLag, bytt } from '../lib/oppstilling'
import { kortnavn } from '../lib/grupper'
import { useOppstilling } from '../composables/useOppstilling'
import { useToast } from '../composables/useToast'
import { meldEvent } from '../lib/sporing'

const props = defineProps({
  team: { type: Object, required: true },
  spillere: { type: Array, required: true },
  spillform: { type: Number, default: 7 },
  kanEndre: { type: Boolean, default: false }
})

const { laste, lagre } = useOppstilling()
const { show: showToast } = useToast()

const FORMASJONSNAVN = { 5: '1-2-1', 7: '2-3-1', 9: '3-3-2', 11: '4-3-3' }
const formasjon = computed(() => formationFor(props.spillform))
const formasjonsnavn = computed(() => FORMASJONSNAVN[props.spillform] || '')
const lasteNa = computed(() => laste(props.team.id, props.spillform))
const justert = computed(() => Object.keys(lasteNa.value).length > 0)
const oppstilling = computed(() => plasserLag(formasjon.value, props.spillere, lasteNa.value, props.spillform))
const navn = computed(() => kortnavn(props.spillere))
const spiller = id => props.spillere.find(p => p.id === id)

function initialer(p) {
  const deler = (p?.name || '').trim().split(/\s+/).filter(Boolean)
  if (!deler.length) return '?'
  return (deler[0][0] + (deler.length > 1 ? deler[deler.length - 1][0] : '')).toUpperCase()
}

// Én brikke per spiller, nøklet på spilleren: når to bytter, glir brikkene
// til de nye plassene i stedet for å blinke.
const pabanen = computed(() => formasjon.value
  .filter(s => oppstilling.value.plasser[s.id])
  .map(s => ({ slot: s, p: spiller(oppstilling.value.plasser[s.id]) }))
  .filter(x => x.p))
const tomme = computed(() => formasjon.value.filter(s => !oppstilling.value.plasser[s.id]))
const benk = computed(() => oppstilling.value.benk.map(spiller).filter(Boolean))

// Passer ikke spilleren plassen (har posisjoner, men ikke denne), vises det
// diskret: treneren ser hvem appen måtte gjette på.
function gjettet(slotId, p) {
  const mine = p?.positions || []
  if (!mine.length) return false
  const pos = positionForSlot(slotId, props.spillform)
  if (mine.includes(pos)) return false
  const fam = { venstre_back: 'forsvar', stopper: 'forsvar', hoyre_back: 'forsvar', venstre_ving: 'ving', hoyre_ving: 'ving' }
  return !mine.some(v => fam[pos] && v === fam[pos])
}

// ── Bytte ──────────────────────────────────────────────────────────────────
const valgt = ref(null) // { slot } | { benk: id }
const erValgt = x => !!valgt.value && (x.slot ? valgt.value.slot === x.slot : valgt.value.benk === x.benk)

async function trykk(x) {
  if (!props.kanEndre) return
  if (!valgt.value) { valgt.value = x; return }
  if (erValgt(x)) { valgt.value = null; return }
  const a = valgt.value
  valgt.value = null
  // To på benken: ingenting å bytte, det nye trykket blir valget.
  if (a.benk && x.benk) { valgt.value = x; return }
  const ny = bytt(oppstilling.value.plasser, a, x)
  meldEvent('oppstilling_byttet', { spillform: props.spillform, benk: !!(a.benk || x.benk) })
  if (!(await lagre(props.team.id, props.spillform, ny))) showToast('Fikk ikke lagret. Prøv igjen.', 'error')
}

async function tilbakestill() {
  valgt.value = null
  const for_ = lasteNa.value
  if (!(await lagre(props.team.id, props.spillform, {}))) { showToast('Fikk ikke lagret. Prøv igjen.', 'error'); return }
  showToast('Appen plasserer laget igjen', 'success', 5000, {
    action: { label: 'Angre', handler: () => lagre(props.team.id, props.spillform, for_) }
  })
}

const hint = computed(() => {
  if (!props.kanEndre) return ''
  if (!valgt.value) return justert.value ? 'Justert av trenerne' : 'Plassert etter posisjonene'
  const p = valgt.value.slot ? spiller(oppstilling.value.plasser[valgt.value.slot]) : spiller(valgt.value.benk)
  return `Bytt ${navn.value[p?.id] || 'plassen'} med …`
})
</script>

<template>
  <div class="lb">
    <div class="lb__meta">
      <span class="lb__form">{{ spillform }}er<template v-if="formasjonsnavn"> · {{ formasjonsnavn }}</template></span>
      <span class="lb__hint" :class="{ 'lb__hint--valgt': valgt }" aria-live="polite">{{ hint }}</span>
    </div>

    <div class="lb__bane" :class="{ 'lb__bane--velger': valgt }">
      <svg class="lb__linjer" viewBox="0 0 68 96" aria-hidden="true">
        <rect v-for="i in 12" :key="i" x="0" :y="(i - 1) * 8" width="68" height="8" :class="i % 2 ? 'lb__stripe' : 'lb__stripe lb__stripe--lys'" />
        <g class="lb__kritt">
          <rect x="3" y="3" width="62" height="90" />
          <line x1="3" y1="48" x2="65" y2="48" />
          <circle cx="34" cy="48" r="8" />
          <rect x="16" y="3" width="36" height="13" />
          <rect x="25" y="3" width="18" height="5" />
          <rect x="16" y="80" width="36" height="13" />
          <rect x="25" y="88" width="18" height="5" />
          <path d="M 28.5 16 A 7 7 0 0 0 39.5 16" />
          <path d="M 28.5 80 A 7 7 0 0 1 39.5 80" />
        </g>
        <g class="lb__punkt">
          <circle cx="34" cy="48" r="0.7" />
          <circle cx="34" cy="12" r="0.6" />
          <circle cx="34" cy="84" r="0.6" />
        </g>
      </svg>

      <button
        v-for="x in pabanen"
        :key="x.p.id"
        type="button"
        class="lb__brikke"
        :class="{ 'lb__brikke--valgt': erValgt({ slot: x.slot.id }), 'lb__brikke--gk': x.slot.role === 'keeper' }"
        :style="{ left: `${x.slot.x}%`, top: `${x.slot.y}%` }"
        :disabled="!kanEndre"
        :aria-label="`${x.p.name}, ${positionLabel(positionForSlot(x.slot.id, spillform))}`"
        :aria-pressed="kanEndre ? (erValgt({ slot: x.slot.id }) ? 'true' : 'false') : undefined"
        @click="trykk({ slot: x.slot.id })"
      >
        <span class="lb__drakt">
          {{ initialer(x.p) }}
          <span class="lb__pos" :class="{ 'lb__pos--gjettet': gjettet(x.slot.id, x.p) }">{{ positionShort(positionForSlot(x.slot.id, spillform)) }}</span>
        </span>
        <span class="lb__navn">{{ navn[x.p.id] }}</span>
      </button>

      <button
        v-for="s in tomme"
        :key="`tom-${s.id}`"
        type="button"
        class="lb__brikke lb__brikke--tom"
        :class="{ 'lb__brikke--valgt': erValgt({ slot: s.id }) }"
        :style="{ left: `${s.x}%`, top: `${s.y}%` }"
        :disabled="!kanEndre"
        :aria-label="`Ledig: ${positionLabel(positionForSlot(s.id, spillform))}`"
        @click="trykk({ slot: s.id })"
      >
        <span class="lb__drakt">{{ positionShort(positionForSlot(s.id, spillform)) }}</span>
        <span class="lb__navn">Ledig</span>
      </button>
    </div>

    <div v-if="benk.length" class="lb__benk">
      <span class="lb__benk-tittel">Innbyttere</span>
      <div class="lb__benk-rad">
        <button
          v-for="p in benk"
          :key="p.id"
          type="button"
          class="lb__innbytter"
          :class="{ 'lb__innbytter--valgt': erValgt({ benk: p.id }) }"
          :disabled="!kanEndre"
          :aria-pressed="kanEndre ? (erValgt({ benk: p.id }) ? 'true' : 'false') : undefined"
          @click="trykk({ benk: p.id })"
        >
          <span class="lb__mini">{{ initialer(p) }}</span>
          {{ navn[p.id] }}
        </button>
      </div>
    </div>

    <button v-if="kanEndre && justert" type="button" class="lb__tilbake" @click="tilbakestill">La appen plassere laget</button>
  </div>
</template>

<style scoped>
.lb { max-width: 460px; margin-inline: auto; --gress: #2a7a4b; --gress-lys: #2f8452; --kritt: rgba(255, 255, 255, .62); }
:global([data-theme="dark"] .lb) { --gress: #1f5c39; --gress-lys: #236441; --kritt: rgba(255, 255, 255, .5); }

.lb__meta {
  display: flex; align-items: baseline; justify-content: space-between; gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
}
.lb__form { flex: none; white-space: nowrap; font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-secondary); font-variant-numeric: tabular-nums; }
.lb__hint { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ds-color-text-tertiary); text-align: right; transition: color .15s ease; }
.lb__hint--valgt { color: var(--ds-color-text-primary); font-weight: var(--ds-weight-semibold); }

/* Banen: solide klippestriper i SVG, kritt oppå. Ingen gradient. */
.lb__bane {
  position: relative;
  width: 100%;
  aspect-ratio: 68 / 96;
  border-radius: var(--ds-radius-lg);
  background: var(--gress);
  box-shadow: var(--ds-shadow-sm);
  overflow: hidden;
  container-type: inline-size;
}
.lb__linjer { position: absolute; inset: 0; width: 100%; height: 100%; }
.lb__stripe { fill: var(--gress); }
.lb__stripe--lys { fill: var(--gress-lys); }
.lb__kritt { fill: none; stroke: var(--kritt); }
.lb__kritt * { vector-effect: non-scaling-stroke; stroke-width: 1.5px; }
.lb__punkt { fill: var(--kritt); }

.lb__brikke {
  position: absolute;
  transform: translate(-50%, -42%);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  width: clamp(64px, 22cqw, 92px);
  padding: 0; border: 0; background: transparent;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  user-select: none; -webkit-user-select: none;
  transition: left .38s cubic-bezier(.2, .8, .2, 1), top .38s cubic-bezier(.2, .8, .2, 1);
}
.lb__brikke:disabled { cursor: default; }
.lb__brikke--gk { transform: translate(-50%, -58%); }

.lb__drakt {
  position: relative;
  display: grid; place-items: center;
  width: clamp(40px, 13cqw, 52px); aspect-ratio: 1;
  border-radius: 50%;
  background: #fff;
  color: var(--accent-text, #1a1a1a);
  border: 3px solid var(--accent-text, #1a1a1a);
  font-family: var(--ds-font-heading);
  font-size: clamp(13px, 4cqw, 16px);
  font-weight: var(--ds-weight-bold);
  letter-spacing: -0.01em;
  box-shadow: 0 2px 6px rgba(0, 0, 0, .28);
  transition: transform .16s cubic-bezier(.2, .8, .2, 1), box-shadow .16s ease;
}
.lb__brikke:not(:disabled):active .lb__drakt { transform: scale(.94); }
.lb__brikke--valgt .lb__drakt {
  transform: scale(1.1);
  box-shadow: 0 0 0 3px #ffd84d, 0 6px 14px rgba(0, 0, 0, .35);
}
.lb__bane--velger .lb__brikke:not(.lb__brikke--valgt) .lb__drakt { box-shadow: 0 0 0 2px rgba(255, 255, 255, .55), 0 2px 6px rgba(0, 0, 0, .28); }

.lb__pos {
  position: absolute; right: -11px; bottom: -6px;
  min-width: 22px; padding: 1px 5px;
  border-radius: var(--ds-radius-full);
  background: #12261a; color: #fff;
  font-family: var(--ds-font-body);
  font-size: 10px; font-weight: var(--ds-weight-bold); line-height: 1.5;
  letter-spacing: .02em;
}
/* Appen måtte gjette: spilleren har posisjoner, men ikke denne. */
.lb__pos--gjettet { background: #fff; color: #12261a; box-shadow: inset 0 0 0 1.5px #12261a; }

.lb__navn {
  max-width: 100%;
  padding: 1px 7px;
  border-radius: var(--ds-radius-full);
  background: rgba(10, 30, 18, .55);
  color: #fff;
  font-size: clamp(11px, 3.4cqw, 13px);
  font-weight: var(--ds-weight-semibold);
  line-height: 1.45;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.lb__brikke--tom .lb__drakt {
  background: rgba(255, 255, 255, .12);
  border: 2px dashed rgba(255, 255, 255, .7);
  color: #fff; box-shadow: none;
  font-family: var(--ds-font-body); font-size: 11px;
}
.lb__brikke--tom .lb__navn { background: transparent; opacity: .8; }

.lb__benk { margin-top: var(--ds-space-md); }
.lb__benk-tittel {
  display: block; margin-bottom: var(--ds-space-sm);
  font-size: var(--ds-text-xs, 12px); font-weight: var(--ds-weight-semibold);
  text-transform: uppercase; letter-spacing: .06em;
  color: var(--ds-color-text-tertiary);
}
.lb__benk-rad { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.lb__innbytter {
  display: inline-flex; align-items: center; gap: var(--ds-space-sm);
  min-height: 44px; padding: 4px 14px 4px 4px;
  border: 1.5px solid var(--ds-color-border-light);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  font: inherit; font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold);
  cursor: pointer;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.lb__innbytter:disabled { cursor: default; }
.lb__innbytter--valgt { border-color: #e0b400; box-shadow: 0 0 0 3px #ffd84d; }
.lb__mini {
  display: grid; place-items: center;
  width: 34px; height: 34px; border-radius: 50%;
  border: 2px solid var(--accent-text, #1a1a1a);
  color: var(--accent-text, #1a1a1a);
  background: #fff;
  font-size: 12px; font-weight: var(--ds-weight-bold);
}

.lb__tilbake {
  display: block; margin-top: var(--ds-space-md); padding: 0;
  border: 0; background: transparent; cursor: pointer;
  color: var(--ds-color-text-secondary);
  font: inherit; font-size: var(--ds-text-sm);
  text-decoration: underline; text-underline-offset: 2px;
}
.lb__tilbake:hover { color: var(--ds-color-text-primary); }

@media (prefers-reduced-motion: reduce) {
  .lb__brikke, .lb__drakt { transition: none; }
}
</style>
