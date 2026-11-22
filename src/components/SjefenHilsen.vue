<script setup>
// Påskeegg (nov. 2026): sjefen i Halsen minner trenerne på bekledningen.
// Vises én gang per trener per telefon, første gang appen åpnes etter at
// dette kom ut. Ikke for plattform-admin (han som la det inn), ikke midt i
// en kamp, og ikke i automatiske tester. `?sjefen=1` viser det uansett.
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../stores/auth'
import { laasScroll, slippScroll } from '../lib/scrollLock'

const route = useRoute()
const { ready, isLoggedIn, isCoach, isPlatformAdmin, activeCohort, coach } = useAuth()

const UTE = ['login', 'auth-callback', 'kom-i-gang', 'match-mode']
const nokkel = computed(() => `bb-sjefen-bekledning:${coach.value?.id || 'ukjent'}`)
const sett = () => { try { return localStorage.getItem(nokkel.value) === '1' } catch { return true } }

const tvunget = computed(() => route.query.sjefen === '1')
const iHalsen = computed(() => /^halsen/i.test(activeCohort.value?.club_short_name || activeCohort.value?.club_name || ''))
const skalVises = computed(() =>
  ready.value && isLoggedIn.value && !!route.name && !UTE.includes(route.name) && !route.meta?.public && (
    tvunget.value ||
    (isCoach.value && !isPlatformAdmin.value && iHalsen.value && !navigator.webdriver && !sett())
  ))

const apen = ref(false)
let ventet = null
let laast = false
function laas(pa) {
  if (pa && !laast) { laasScroll(); laast = true }
  if (!pa && laast) { slippScroll(); laast = false }
}

watch(skalVises, v => {
  clearTimeout(ventet)
  // Litt etter at skjermen står, så den ikke slåss med første visning.
  if (v && !apen.value) ventet = setTimeout(() => { apen.value = true; laas(true) }, 700)
}, { immediate: true })

function lukk() {
  try { localStorage.setItem(nokkel.value, '1') } catch { /* privat modus */ }
  apen.value = false
  laas(false)
}

onUnmounted(() => { clearTimeout(ventet); laas(false) })
</script>

<template>
  <Teleport to="body">
    <Transition name="sjefen">
      <div v-if="apen" class="ds-overlay sjefen" @click.self="lukk">
        <div class="sjefen__kort" role="dialog" aria-modal="true" aria-labelledby="sjefen-tekst">
          <img class="sjefen__bilde" src="/illustrations/bench-boss-card-art/halsen-sjef-leire.webp" alt="" width="200" height="200" decoding="async" />
          <p id="sjefen-tekst" class="sjefen__tekst">Husk riktig bekledning, gutter!</p>
          <button type="button" class="ds-btn ds-btn--primary sjefen__knapp" @click="lukk">Skal bli, sjef</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sjefen { padding: var(--ds-space-lg); }
.sjefen__kort {
  position: relative;
  width: 100%; max-width: 360px; box-sizing: border-box;
  /* Rom til sjefen, som stikker opp over kanten. */
  margin-top: 96px;
  padding: 112px var(--ds-space-lg) var(--ds-space-lg);
  display: flex; flex-direction: column; align-items: center; gap: var(--ds-space-lg);
  text-align: center;
  background: var(--ds-color-bg-elevated);
  border-radius: 28px;
  box-shadow: var(--ds-shadow-xl);
}
.sjefen__bilde {
  position: absolute; top: -96px; left: 50%;
  width: 200px; height: 200px; margin-left: -100px;
  display: block;
}
.sjefen__tekst {
  margin: 0;
  font-family: var(--ds-font-heading);
  font-size: 1.75rem; line-height: 1.2;
  font-weight: var(--ds-weight-bold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
  text-wrap: balance;
}
.sjefen__knapp { width: 100%; min-height: 56px; border-radius: var(--ds-radius-lg); font-size: var(--ds-text-md); }

.sjefen-enter-active, .sjefen-leave-active { transition: opacity 0.2s ease; }
.sjefen-enter-active .sjefen__kort { transition: transform 0.42s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.2s ease; }
.sjefen-leave-active .sjefen__kort { transition: transform 0.18s ease, opacity 0.18s ease; }
.sjefen-enter-from, .sjefen-leave-to { opacity: 0; }
.sjefen-enter-from .sjefen__kort { transform: translateY(24px) scale(0.96); opacity: 0; }
.sjefen-leave-to .sjefen__kort { transform: scale(0.98); opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .sjefen-enter-active .sjefen__kort, .sjefen-leave-active .sjefen__kort { transition: none; }
}
</style>
