<script setup>
import Ikon from '../components/Ikon.vue'
// KJØREPLANEN — øvelsene for økta.
//
// Oppmøte og inndeling bor i Del inn (Alex, 16. nov): velg trening, hvem er
// her, del inn. Her er bare planen, med en snarvei dit.
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTrainingWeek } from '../composables/useTrainingWeek'
import { useExercises, resolveDrills, EQUIPMENT_TAGS } from '../composables/useExercises'
import { usePlayers } from '../composables/usePlayers'
import { riggFor as riggTags, stasjonerFor } from '../lib/grupper'
import Sheet from '../components/Sheet.vue'
import { useAuth } from '../stores/auth'
import { meldEvent } from '../lib/sporing'
import OvelseRader from '../components/OvelseRader.vue'
import OvelseArk from '../components/OvelseArk.vue'
import BackLink from '../components/BackLink.vue'
import { planLink } from '../lib/trainingLinks'

const route = useRoute()
const router = useRouter()
const { isCoach } = useAuth()
const { players, fetchPlayers } = usePlayers()
const { days, fetchWeek, fetchSession } = useTrainingWeek()
const { exercises, fetchExercises } = useExercises()

// Direkte lenke uten cache: den ene raden hentes for seg, så planen står før
// hele uka er hentet.
const enkelt = ref(null)
const session = computed(() => days.value.find(s => s.id === route.params.id) || enkelt.value)
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
// Riggen: det som må stå klart før treninga, regnet for hele kullet. Den som
// rigger vet ikke hvor mange som kommer, så stasjonene er for alle.
const rigg = computed(() => {
  const tags = riggTags(drills.value)
  return {
    utstyr: EQUIPMENT_TAGS.filter(t => tags.includes(t.value)).map(t => t.label),
    stasjoner: drills.value.map(d => ({ navn: d.text, n: stasjonerFor(d, players.value.length) })).filter(x => x.n > 1)
  }
})
const visRigg = ref(false)

const minutter = computed(() => drills.value.reduce((s, d) => s + (d.minutes || 0), 0))

const apen = ref(null)
function apne(i) {
  apen.value = i
  meldEvent('okt_ovelse_apnet')
}

onMounted(() => {
  // Kjøreplanen er for trenerne. Andre får lesevisningen av dagen.
  if (!isCoach.value) {
    router.replace(planLink(route.params.id))
    return
  }
  fetchPlayers()
  if (!days.value.some(s => s.id === route.params.id)) {
    fetchSession(route.params.id).then(r => { if (r && r.id === route.params.id) enkelt.value = r })
  }
  fetchWeek()
  fetchExercises()
})

// Kjøreplanen er der en trening åpner, så tilbake er uka.
const tilbakeTil = '/trening'
</script>

<template>
  <div class="okt">
    <nav class="okt__bar">
      <BackLink :to="tilbakeTil" label="Trening" historikk />
    </nav>

    <p v-if="!isCoach" class="okt__tom">Kjøreplanen er for trenerne.</p>
    <p v-else-if="!session" class="okt__tom">Laster …</p>

    <div v-else class="plan">
      <h1 class="okt__h1 okt__tittel">{{ session.title || 'Trening' }}</h1>
      <RouterLink to="/del-inn" class="plan__delinn">
        <span class="plan__delinn-tekst"><strong>Del inn</strong></span>
        <Ikon navn="pil-hoyre" aria-hidden="true" />
      </RouterLink>
      <button
        v-if="rigg.utstyr.length || rigg.stasjoner.length"
        type="button"
        class="rigg-rad"
        @click="visRigg = true"
      >
        <span class="rigg-rad__merke">Rigg</span>
        <span class="rigg-rad__ting">{{ rigg.utstyr.join(', ') || `${rigg.stasjoner.length} øvelser med stasjoner` }}</span>
        <Ikon navn="pil-hoyre" vekt="bold" aria-hidden="true" />
      </button>

      <section class="fase">
        <div class="fase__hode">
          <h2 class="fase__tittel fase__tittel--alene">Øvelsene</h2>
          <span v-if="minutter" class="fase__min">{{ minutter }} min</span>
        </div>
        <OvelseRader :kort="kort" :meta="metaFor" @apne="apne" />
      </section>

      <div class="plan__fot">
        <RouterLink :to="planLink(session.id)" class="ds-btn ds-btn--secondary plan__planlegg">
          {{ drills.length ? 'Planlegg treninga' : 'Legg til øvelser' }}
        </RouterLink>
      </div>
    </div>

    <Sheet :show="visRigg" title="Rigg" @close="visRigg = false">
      <p v-if="rigg.utstyr.length" class="rigg__utstyr">{{ rigg.utstyr.join(' · ') }}</p>
      <ul v-if="rigg.stasjoner.length" class="rigg__liste">
        <li v-for="(x, i) in rigg.stasjoner" :key="i">
          <span class="rigg__navn">{{ x.navn }}</span>
          <span class="rigg__n">{{ x.n }} stasjoner</span>
        </li>
      </ul>
    </Sheet>

    <!-- Samme ark som uka og dagen. -->
    <OvelseArk
      v-model:i="apen"
      :liste="drills"
      :hvor="apen != null && session ? `${session.title} · ${apen + 1} av ${drills.length}` : ''"
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
  max-width: var(--ds-content-max);
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) 0;
}
.okt__tittel { padding: 0 var(--ds-space-lg); margin-bottom: var(--ds-space-md); }
.okt__back {
  display: grid; place-items: center; width: 44px; height: 44px; margin-left: calc(var(--ds-space-12) * -1);
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
.okt__dato { margin-left: var(--ds-space-sm); font-weight: var(--ds-weight-medium); color: var(--ds-color-text-tertiary); }
.okt__her {
  margin-left: auto; flex: none;
  min-height: 44px;
  padding: 0 var(--ds-space-md);
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
  font-weight: var(--ds-weight-black);
  letter-spacing: var(--ds-tracking-tight);
  line-height: var(--ds-leading-tight);
  color: var(--ds-color-text-primary);
  margin: 0;
}

/* ── D1 Hvem er her? ── */
.oppm { max-width: var(--ds-content-max); margin: 0 auto; padding: var(--ds-space-xl) var(--ds-space-lg) 180px; }
.oppm__teller {
  margin: var(--ds-space-xl) 0 var(--ds-space-lg);
  font-size: var(--ds-text-md); color: var(--ds-color-text-secondary);
  font-variant-numeric: tabular-nums;
}
.oppm__teller strong {
  margin-right: var(--ds-space-sm);
  font-size: 48px; line-height: 1; letter-spacing: -0.02em;
  font-weight: var(--ds-weight-bold); color: var(--ds-color-text-primary);
}
.oppm__teller--ark { margin: 0 0 var(--ds-space-lg); }
.oppm__teller--ark strong { font-size: var(--ds-text-xl); margin-right: var(--ds-space-xs); }

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
.oppm__fot-inn { max-width: var(--ds-content-max); margin: 0 auto; }
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
.rigg-rad {
  display: flex; align-items: center; gap: var(--ds-space-md);
  width: calc(100% - 2 * var(--ds-space-lg));
  min-height: 52px;
  margin: var(--ds-space-sm) var(--ds-space-lg) 0;
  padding: 0 var(--ds-space-md);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  color: inherit; font: inherit; text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.rigg-rad svg { width: 18px; height: 18px; flex: none; color: var(--ds-color-text-tertiary); }
.rigg-rad__merke { flex: none; font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.rigg-rad__ting { flex: 1; min-width: 0; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rigg__utstyr { margin: 0 0 var(--ds-space-lg); font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); line-height: 1.5; }
.rigg__liste { list-style: none; margin: 0; padding: 0; }
.rigg__liste li {
  display: flex; justify-content: space-between; gap: var(--ds-space-md);
  padding: var(--ds-space-md) 0;
  border-top: 1px solid var(--ds-color-border);
  font-size: var(--ds-text-sm);
}
.rigg__navn { color: var(--ds-color-text-primary); min-width: 0; }
.rigg__n { flex: none; font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); font-variant-numeric: tabular-nums; }
.plan__fot { padding: 0 var(--ds-space-lg) var(--ds-space-xl); }
.plan__planlegg { width: 100%; }
.plan { max-width: var(--ds-content-max); margin: 0 auto; padding: var(--ds-space-lg) 0 0; }
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
  height: 28px; padding: 0 var(--ds-space-12);
  border-radius: var(--ds-radius-full);
  background: var(--ds-badge-bg, var(--ds-color-bg-subtle));
  color: var(--ds-badge-text, var(--ds-color-text-primary));
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold);
}
.fase__endret { margin: calc(var(--ds-space-xs) * -1) 0 var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.fase__ovelser { margin-top: var(--ds-space-sm); }
.fase__ovelser--forst { margin: calc(var(--ds-space-sm) * -1) 0 var(--ds-space-md); }
.gjeng__pluss {
  flex: none; padding: var(--ds-space-2xs) var(--ds-space-12);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-xs, 12px); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

/* ── Endre ── */
.endre { max-width: var(--ds-content-max); margin: 0 auto; padding: 0 var(--ds-space-lg) 300px; }
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
  flex: none; min-height: 44px; padding: 0 var(--ds-space-xs);
  border: 0; background: none;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  text-decoration: underline; text-underline-offset: 3px;
  cursor: pointer;
}
.endre__hint { margin: var(--ds-space-md) 0 var(--ds-space-lg); font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.okt__antall {
  margin-left: auto; flex: none;
  min-height: 44px; padding: 0 var(--ds-space-xs);
  border: 0; background: none;
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
  cursor: pointer;
}
.okt__antall strong { color: var(--ds-color-text-primary); font-variant-numeric: tabular-nums; }
.fase__til { margin: calc(var(--ds-space-xs) * -1) 0 var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.fase__endre {
  margin-left: auto; flex: none;
  min-height: 44px; padding: 0 var(--ds-space-md);
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
  min-width: 32px; height: 28px; padding: 0 var(--ds-space-sm);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  font-size: var(--ds-text-xs, 12px); font-weight: var(--ds-weight-bold);
}
.gjeng__niva--liten { min-width: 26px; height: 22px; padding: 0 var(--ds-space-sm); }
.gjeng__trener { min-width: 0; font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.gjeng__ant { margin-left: auto; flex: none; font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); font-variant-numeric: tabular-nums; }
.gjeng__navn { margin: var(--ds-space-sm) 0 0; font-size: var(--ds-text-md); line-height: 1.6; color: var(--ds-color-text-primary); }

.bane + .bane { margin-top: var(--ds-space-lg); }
.bane__hode {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--ds-space-xs) var(--ds-space-sm);
  margin: 0 0 var(--ds-space-sm);
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
}
.bane__hode strong { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }

.okt__slett {
  display: block;
  margin: var(--ds-space-xl) auto 0;
  min-height: 44px;
  border: 0; background: none; padding: 0 var(--ds-space-md);
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-error, var(--ds-color-text-secondary));
  cursor: pointer;
}

/* ── Arkene ── */
.ark__nr { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.ark__meta { margin: var(--ds-space-xs) 0 var(--ds-space-lg); font-size: var(--ds-text-sm); line-height: 1.4; color: var(--ds-color-text-secondary); }
.antall { display: flex; align-items: center; gap: var(--ds-space-12); margin: calc(-1 * var(--ds-space-sm)) 0 var(--ds-space-lg); }
.antall__navn { flex: none; min-width: 64px; font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.antall__valg { flex: 1; display: flex; gap: var(--ds-space-sm); min-width: 0; }
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
  display: flex; flex-direction: column; gap: var(--ds-space-2xs);
  padding: var(--ds-space-md) var(--ds-space-20);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-subtle, var(--ds-color-bg-elevated));
  font-size: var(--ds-text-sm); line-height: 1.45;
  color: var(--ds-color-text-secondary);
}
.inn strong { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }

.endre-gr + .endre-gr { margin-top: var(--ds-space-xl); }
.endre-gr .gjeng__hode { margin-bottom: var(--ds-space-12); }
.brikker { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.brikke {
  min-height: 44px; padding: 0 var(--ds-space-md);
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
  padding: 0 var(--ds-space-sm);
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
  display: flex; align-items: center; justify-content: center; gap: var(--ds-space-12);
  min-height: 52px; padding: 0 var(--ds-space-12);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}
.plan__delinn {
  display: flex; align-items: center; gap: var(--ds-space-md);
  min-height: 64px; margin: 0 var(--ds-space-lg) var(--ds-space-sm);
  padding: var(--ds-space-md) var(--ds-space-lg);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.plan__delinn svg { flex: none; width: 20px; height: 20px; }
.plan__delinn-tekst { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--ds-space-2xs); }
.plan__delinn-tekst strong { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); }
.plan__delinn-tekst span { font-size: var(--ds-text-sm); opacity: .85; }
.fase__min { margin-left: auto; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); font-variant-numeric: tabular-nums; }
</style>
