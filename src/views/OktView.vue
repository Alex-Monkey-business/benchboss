<script setup>
// KJØREPLANEN — øvelsene for økta.
//
// Oppmøte og inndeling bor i Del inn (Alex, 16. nov): velg trening, hvem er
// her, del inn. Her er bare planen, med en snarvei dit.
import { ref, computed, nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTrainingWeek } from '../composables/useTrainingWeek'
import { useExercises, resolveDrills, EQUIPMENT_TAGS } from '../composables/useExercises'
import { useAuth } from '../stores/auth'
import { meldEvent } from '../lib/sporing'
import ExerciseView from '../components/ExerciseView.vue'
import Sheet from '../components/Sheet.vue'
import OvelseRader from '../components/OvelseRader.vue'

const route = useRoute()
const router = useRouter()
const { isCoach } = useAuth()
const { days, fetchWeek } = useTrainingWeek()
const { exercises, fetchExercises } = useExercises()

const session = computed(() => days.value.find(s => s.id === route.params.id) || null)
const drills = computed(() => (session.value ? resolveDrills(session.value.drills, exercises.value) : []))

const utstyrNavn = Object.fromEntries(EQUIPMENT_TAGS.map(t => [t.value, t.label.toLowerCase()]))
const kort = computed(() => drills.value.map((d, i) => ({ d, i })))
const TYPE = { diff: 'grupper på nivå', mix: 'lag, blandet' }
function metaFor(k) {
  const deler = []
  if (k.d.minutes) deler.push(`${k.d.minutes} min`)
  deler.push(TYPE[k.d.type] || 'alle sammen')
  const ting = (k.d.utstyr_tags || []).map(t => utstyrNavn[t]).filter(Boolean)
  if (ting.length) deler.push(ting.join(', '))
  return deler.join(' · ')
}
const minutter = computed(() => drills.value.reduce((s, d) => s + (d.minutes || 0), 0))

const apen = ref(null)
const aktiv = computed(() => (apen.value == null ? null : kort.value[apen.value] || null))
async function bla(d) {
  const j = apen.value + d
  if (j < 0 || j >= kort.value.length) return
  apen.value = j
  await nextTick()
  document.querySelectorAll('.ds-sheet__body').forEach(el => el.scrollTo({ top: 0 }))
}
function apne(i) {
  apen.value = i
  meldEvent('okt_ovelse_apnet')
}

onMounted(() => {
  fetchWeek()
  fetchExercises()
})

function tilbake() {
  if (window.history.state?.back) return router.back()
  router.push(session.value ? `/trening/dag/${session.value.id}` : '/trening')
}
</script>

<template>
  <div class="okt">
    <header class="okt__bar">
      <button class="okt__back" aria-label="Tilbake" @click="tilbake">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="okt__title">{{ session?.title || 'Trening' }}</span>
    </header>

    <p v-if="!isCoach" class="okt__tom">Kjøreplanen er for trenerne.</p>
    <p v-else-if="!session" class="okt__tom">Laster …</p>

    <div v-else class="plan">
      <RouterLink to="/del-inn" class="plan__delinn">
        <span class="plan__delinn-tekst"><strong>Del inn</strong></span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
      </RouterLink>

      <section class="fase">
        <div class="fase__hode">
          <h2 class="fase__tittel fase__tittel--alene">Øvelsene</h2>
          <span v-if="minutter" class="fase__min">{{ minutter }} min</span>
        </div>
        <OvelseRader :kort="kort" :meta="metaFor" @apne="apne" />
      </section>
    </div>

    <Sheet :show="!!aktiv" :title="aktiv?.d.text || ''" tall @close="apen = null">
      <template v-if="aktiv">
        <p class="ark__nr">Øvelse {{ aktiv.i + 1 }} av {{ kort.length }}</p>
        <p class="ark__meta">{{ metaFor(aktiv) }}</p>
        <ExerciseView :exercise="aktiv.d" :minutes="aktiv.d.minutes || 0" />
      </template>
      <template #footer>
        <div v-if="aktiv" class="fot">
          <button type="button" class="fot__pil" :disabled="apen === 0" aria-label="Forrige øvelse" @click="bla(-1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button type="button" class="fot__knapp" @click="apen = null">Lukk</button>
          <button type="button" class="fot__pil" :disabled="apen === kort.length - 1" aria-label="Neste øvelse" @click="bla(1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </template>
    </Sheet>
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
  display: grid; place-items: center; width: 44px; height: 44px; margin-left: -12px;
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
  min-height: 44px;
  padding: 0 16px;
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

/* ── D1 Hvem er her? ── */
.oppm { max-width: 560px; margin: 0 auto; padding: var(--ds-space-xl) var(--ds-space-lg) 180px; }
.oppm__teller {
  margin: var(--ds-space-xl) 0 var(--ds-space-lg);
  font-size: var(--ds-text-md); color: var(--ds-color-text-secondary);
  font-variant-numeric: tabular-nums;
}
.oppm__teller strong {
  margin-right: 8px;
  font-size: 48px; line-height: 1; letter-spacing: -0.02em;
  font-weight: var(--ds-weight-bold); color: var(--ds-color-text-primary);
}
.oppm__teller--ark { margin: 0 0 var(--ds-space-lg); }
.oppm__teller--ark strong { font-size: var(--ds-text-xl); margin-right: 4px; }

/* Fast over bunnmenyen, ikke sticky: en sticky knapp følger innholdet når
   du scroller til bunnen av navnelista, og da hopper den. */
.oppm__fot {
  position: fixed;
  left: 0; right: 0;
  bottom: calc(65px + env(safe-area-inset-bottom, 0px));
  z-index: calc(var(--ds-z-sticky) - 1);
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: var(--ds-color-bg);
  border-top: 1px solid var(--ds-color-border-light, var(--ds-color-border));
}
.oppm__fot-inn { max-width: 560px; margin: 0 auto; }
@media (min-width: 768px) {
  .oppm__fot { bottom: 0; }
}
.oppm__linje {
  margin: 0 0 var(--ds-space-md);
  font-size: var(--ds-text-sm); line-height: 1.4;
  color: var(--ds-color-text-secondary);
  text-align: center;
}
.oppm__linje strong { color: var(--ds-color-text-primary); font-weight: var(--ds-weight-semibold); }
.okt__start {
  display: block; width: 100%;
  min-height: var(--ds-btn-h-lg); border: none; border-radius: var(--ds-radius-lg);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  font-family: var(--ds-font-body); font-size: var(--ds-text-lg); font-weight: var(--ds-weight-bold);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
}
.okt__start:disabled { opacity: .45; cursor: default; }

/* ── D2 Kjøreplanen ── */
.plan { max-width: 560px; margin: 0 auto; padding: var(--ds-space-lg) 0 0; }
.plan__lokal {
  margin: 0 var(--ds-space-lg) var(--ds-space-sm);
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
}

.fase { padding: var(--ds-space-lg) var(--ds-space-lg) var(--ds-space-xl); }
.fase + .fase { border-top: 1px solid var(--ds-color-border-light, var(--ds-color-border)); padding-top: var(--ds-space-xl); }
.fase__hode { display: flex; align-items: center; gap: var(--ds-space-md); margin-bottom: var(--ds-space-md); }
.fase__tittel {
  margin: 0;
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-xl);
  font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
  letter-spacing: -0.01em;
}
.fase__tittel--alene { margin-bottom: var(--ds-space-sm); }
.fase { scroll-margin-top: 72px; }
.fase__tag, .okt__tag {
  flex: none; display: inline-flex; align-items: center;
  height: 28px; padding: 0 12px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-badge-bg, var(--ds-color-bg-subtle));
  color: var(--ds-badge-text, var(--ds-color-text-primary));
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold);
}
.fase__endret { margin: -4px 0 var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.fase__ovelser { margin-top: var(--ds-space-sm); }
.fase__ovelser--forst { margin: -8px 0 var(--ds-space-md); }
.gjeng__pluss {
  flex: none; padding: 2px 10px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-xs, 12px); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

/* ── Endre ── */
.endre { max-width: 560px; margin: 0 auto; padding: 0 var(--ds-space-lg) 300px; }
.endre__styr {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  margin: 0 calc(-1 * var(--ds-space-lg));
  padding: var(--ds-space-sm) var(--ds-space-lg) var(--ds-space-md);
  border-bottom: 1px solid var(--ds-color-border-light, var(--ds-color-border));
}
.endre__gjelder { font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.endre__info {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  min-height: 44px; padding-top: var(--ds-space-sm);
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
}
.endre__trekk {
  flex: none; min-height: 44px; padding: 0 4px;
  border: 0; background: none;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  text-decoration: underline; text-underline-offset: 3px;
  cursor: pointer;
}
.endre__hint { margin: var(--ds-space-md) 0 var(--ds-space-lg); font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.okt__antall {
  margin-left: auto; flex: none;
  min-height: 44px; padding: 0 4px;
  border: 0; background: none;
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
  cursor: pointer;
}
.okt__antall strong { color: var(--ds-color-text-primary); font-variant-numeric: tabular-nums; }
.fase__til { margin: -4px 0 var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.fase__endre {
  margin-left: auto; flex: none;
  min-height: 44px; padding: 0 16px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}

.kortene { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
.gjeng {
  padding: var(--ds-space-md) var(--ds-space-lg);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-subtle, var(--ds-color-bg-elevated));
}
.gjeng__hode { display: flex; align-items: center; gap: var(--ds-space-md); }
.gjeng__niva {
  flex: none;
  display: grid; place-items: center;
  min-width: 32px; height: 28px; padding: 0 8px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  font-size: var(--ds-text-xs, 12px); font-weight: var(--ds-weight-bold);
}
.gjeng__niva--liten { min-width: 26px; height: 22px; padding: 0 6px; }
.gjeng__trener { min-width: 0; font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.gjeng__ant { margin-left: auto; flex: none; font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); font-variant-numeric: tabular-nums; }
.gjeng__navn { margin: var(--ds-space-sm) 0 0; font-size: var(--ds-text-md); line-height: 1.6; color: var(--ds-color-text-primary); }

.bane + .bane { margin-top: var(--ds-space-lg); }
.bane__hode {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px;
  margin: 0 0 var(--ds-space-sm);
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
}
.bane__hode strong { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }

.okt__slett {
  display: block;
  margin: var(--ds-space-xl) auto 0;
  min-height: 44px;
  border: 0; background: none; padding: 0 16px;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-error, var(--ds-color-text-secondary));
  cursor: pointer;
}

/* ── Arkene ── */
.ark__nr { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.ark__meta { margin: 4px 0 var(--ds-space-lg); font-size: var(--ds-text-sm); line-height: 1.4; color: var(--ds-color-text-secondary); }
.antall { display: flex; align-items: center; gap: 12px; margin: calc(-1 * var(--ds-space-sm)) 0 var(--ds-space-lg); }
.antall__navn { flex: none; min-width: 64px; font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.antall__valg { flex: 1; display: flex; gap: 6px; min-width: 0; }
.antall__knapp {
  flex: 1 1 0; min-width: 0; min-height: 44px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md, 10px);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
}
.antall__knapp--valgt { border-color: var(--ds-color-accent); background: var(--ds-color-accent); color: var(--ds-color-accent-text); }

.inn {
  display: flex; flex-direction: column; gap: 2px;
  padding: 14px 18px;
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-subtle, var(--ds-color-bg-elevated));
  font-size: var(--ds-text-sm); line-height: 1.45;
  color: var(--ds-color-text-secondary);
}
.inn strong { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }

.endre-gr + .endre-gr { margin-top: var(--ds-space-xl); }
.endre-gr .gjeng__hode { margin-bottom: 10px; }
.brikker { display: flex; flex-wrap: wrap; gap: 8px; }
.brikke {
  min-height: 44px; padding: 0 14px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.brikke--valgt { border-color: var(--ds-color-accent); background: var(--ds-color-accent); color: var(--ds-color-accent-text); }

.fot { display: flex; align-items: center; gap: var(--ds-space-sm); min-height: 48px; }
.fot--kolonne { flex-direction: column; align-items: stretch; }
.fot__pil {
  flex: none;
  display: grid; place-items: center;
  width: 52px; height: 52px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}
.fot__pil svg { width: 20px; height: 20px; }
.fot__pil:disabled { color: var(--ds-color-text-tertiary); opacity: .5; cursor: default; }
.fot__knapp {
  flex: 1 1 0;
  min-height: var(--ds-btn-h-lg);
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-subtle, var(--ds-color-bg-elevated));
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}
.fot__knapp--hoved { background: var(--ds-color-accent); color: var(--ds-color-accent-text); }
.fot__knapp--bred { width: 100%; flex: none; }
.fot__hint { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.fot__hint strong { color: var(--ds-color-text-primary); }
.fot__tekst {
  min-height: 44px; border: 0; background: none;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
}
.mal { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.mal__knapp {
  flex: 1 1 120px;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  min-height: 52px; padding: 0 12px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}
.plan__delinn {
  display: flex; align-items: center; gap: var(--ds-space-md);
  min-height: 72px; margin-bottom: var(--ds-space-lg);
  padding: var(--ds-space-md) var(--ds-space-lg);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.plan__delinn svg { flex: none; width: 20px; height: 20px; }
.plan__delinn-tekst { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.plan__delinn-tekst strong { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); }
.plan__delinn-tekst span { font-size: var(--ds-text-sm); opacity: .85; }
.fase__min { margin-left: auto; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); font-variant-numeric: tabular-nums; }
</style>
