<script setup>
import { computed, onMounted, ref } from 'vue'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerLevels, LEVELS } from '../composables/usePlayerLevels'
import { useToast } from '../composables/useToast'
import { shortRelativeDate } from '../lib/dateLabels'

// Nivå A/B/C for hele kullet på én skjerm.
//
// Gruppert etter nivå, og raden flytter seg når du tapper: oversikten og
// redigeringen er samme bevegelse. «Uten nivå» står først så lenge den har
// noen — første gang er det arbeidslista, og den tømmer seg mens du går.

const { players, fetchPlayers } = usePlayers()
const { playerLevels, fetchPlayerLevels, levelFor, setLevel } = usePlayerLevels()
const { show: showToast } = useToast()

const ready = ref(false)
onMounted(async () => {
  await Promise.all([fetchPlayers(), fetchPlayerLevels()])
  ready.value = true
})

const groups = computed(() => {
  const by = { A: [], B: [], C: [], none: [] }
  for (const p of players.value) by[levelFor(p.id) || 'none'].push(p)
  const out = LEVELS.map(l => ({ key: l, label: `Nivå ${l}`, players: by[l] }))
  if (by.none.length) out.unshift({ key: 'none', label: 'Uten nivå', players: by.none })
  return out
})

const counts = computed(() => LEVELS.map(l => ({
  level: l,
  n: groups.value.find(g => g.key === l)?.players.length || 0
})))

// Sist noen rørte et nivå. Ved sesongstart er det påminnelsen om å se over.
const lastChanged = computed(() => {
  const ts = playerLevels.value.map(r => r.updated_at).filter(Boolean).sort().pop()
  if (!ts) return ''
  const d = shortRelativeDate(ts.slice(0, 10))
  return d.charAt(0).toLowerCase() + d.slice(1)
})

async function pick(player, level) {
  const next = levelFor(player.id) === level ? null : level
  const ok = await setLevel(player.id, next)
  if (!ok) showToast(`Fikk ikke lagret nivået til ${player.name}`, 'error')
}
</script>

<template>
  <div class="niva">
    <div class="niva__back-wrap">
      <router-link to="/admin" class="niva__back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Admin
      </router-link>
    </div>

    <header class="niva__head">
      <h1 class="niva__title">Nivå</h1>
      <p class="niva__lead">Brukes til å fordele grupper på differensierte øvelser. Bare trenere ser dette.</p>
    </header>

    <p v-if="!ready" class="niva__muted">Henter spillere …</p>
    <p v-else-if="!players.length" class="niva__muted">Ingen spillere i kullet ennå.</p>

    <template v-else>
      <div class="niva__counts" aria-label="Antall per nivå">
        <div v-for="c in counts" :key="c.level" class="niva__count">
          <span class="niva__count-n">{{ c.n }}</span>
          <span class="niva__count-l">Nivå {{ c.level }}</span>
        </div>
      </div>
      <p v-if="lastChanged" class="niva__note">Sist endret {{ lastChanged }}</p>

      <section v-for="g in groups" :key="g.key" class="niva__group">
        <h2 class="niva__label">
          {{ g.label }}
          <span class="niva__label-n">{{ g.players.length }}</span>
        </h2>
        <p v-if="!g.players.length" class="niva__empty">Ingen her.</p>
        <TransitionGroup v-else tag="ul" name="niva-rad" class="niva__list">
          <li v-for="p in g.players" :key="p.id" class="niva__row">
            <router-link :to="`/spiller/${p.id}`" class="niva__name">{{ p.name }}</router-link>
            <div class="niva__seg" role="radiogroup" :aria-label="`Nivå for ${p.name}`">
              <button
                v-for="l in LEVELS"
                :key="l"
                type="button"
                role="radio"
                :aria-checked="levelFor(p.id) === l"
                :class="['niva__opt', { 'niva__opt--on': levelFor(p.id) === l }]"
                @click="pick(p, l)"
              >{{ l }}</button>
            </div>
          </li>
        </TransitionGroup>
      </section>
      <p class="niva__note">Trykk på valgt nivå igjen for å fjerne det.</p>
    </template>
  </div>
</template>

<style scoped>
.niva {
  max-width: 680px;
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.niva__back-wrap { margin-bottom: var(--ds-space-xl); }
.niva__back {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary); text-decoration: none;
}
.niva__back svg { width: 14px; height: 14px; }
.niva__back:hover { color: var(--ds-color-text-primary); }

.niva__head { margin-bottom: var(--ds-space-xl); }
.niva__title {
  font-size: var(--ds-text-3xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  color: var(--ds-color-text-primary);
  margin: 0 0 var(--ds-space-sm);
}
.niva__lead { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); line-height: 1.5; }

.niva__muted { color: var(--ds-color-text-tertiary); font-size: var(--ds-text-sm); }

.niva__counts {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--ds-space-sm);
}
.niva__count {
  display: flex; flex-direction: column; gap: 2px;
  padding: var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
}
.niva__count-n {
  font-size: var(--ds-text-2xl); font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums; color: var(--ds-color-text-primary); line-height: 1.1;
}
.niva__count-l { font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary); }

.niva__note { margin: var(--ds-space-sm) 0 0; font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary); }

.niva__group { margin-top: var(--ds-space-2xl); }
.niva__label {
  display: flex; align-items: baseline; gap: var(--ds-space-sm);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-xs); font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider); text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  margin: 0 0 var(--ds-space-md);
}
.niva__label-n { font-weight: var(--ds-weight-medium); font-variant-numeric: tabular-nums; }
.niva__empty { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); }

.niva__list {
  position: relative;
  list-style: none; margin: 0; padding: 0;
  overflow: hidden;
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
}
.niva__row {
  display: flex; align-items: center; gap: var(--ds-space-md);
  min-height: 60px;
  padding: var(--ds-space-sm) var(--ds-space-sm) var(--ds-space-sm) var(--ds-space-lg);
  background: var(--ds-color-bg-elevated);
  border-radius: var(--ds-radius-lg);
}
.niva__row + .niva__row { border-top: var(--ds-border-width) solid var(--ds-color-border); border-radius: 0; }

.niva__name {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--ds-text-base); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary); text-decoration: none;
}

.niva__seg { display: flex; gap: 4px; flex: none; }
.niva__opt {
  width: 44px; height: 44px; cursor: pointer;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
  border: 1.5px solid var(--ds-color-border); border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  transition: border-color .15s ease, background .15s ease, color .15s ease, transform .1s ease;
  -webkit-tap-highlight-color: transparent;
}
.niva__opt:active { transform: scale(0.94); }
.niva__opt--on {
  border-color: var(--ds-color-accent);
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}

/* Raden som forlater en gruppe glir ut; de som blir igjen tetter hullet. */
.niva-rad-move { transition: transform .25s cubic-bezier(.2, .8, .2, 1); }
.niva-rad-enter-active { transition: opacity .2s ease .05s, transform .2s ease .05s; }
.niva-rad-leave-active { transition: opacity .15s ease; position: absolute; left: 0; right: 0; }
.niva-rad-enter-from { opacity: 0; transform: translateY(-6px); }
.niva-rad-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .niva-rad-move, .niva-rad-enter-active, .niva-rad-leave-active { transition: none; }
}
</style>
