<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// Illustrasjonssettet (sep. 2026): myke 3D-motiver i appens palett, AVIF
// med WebP som reserve, 128/192/320 px. Filene ligger i
// public/illustrations/spot/ og bare motivene appen bruker er kopiert inn.
//
// Bevegelse skal bety noe, så bare fire motiver beveger seg, og hver bevegelse
// er motivets egen handling, spilt én gang:
//  - stats: søylene bygger seg opp når motivet blir synlig (play="auto")
//  - import: pila går ned i kalenderen når forelderen sier at en fil er lest (play=true)
//  - match-red/-green/-white: ballen ruller inn til drakta på neste kamp (play="auto")
//  - passing: ballen spilles gjennom portene på pasningsøkta (play="auto")
// Alt annet står stille. Redusert bevegelse viser ferdig motiv uten animasjon,
// og en skjult fane stopper bevegelsen.
// `size` er visningsbredden i px og styrer bare hvilken fil nettleseren
// velger (sizes). Selve bredden setter stedet som bruker motivet, via
// --spot-size på sin egen klasse, så responsive regler virker som før.
const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 96 },
  play: { type: [Boolean, String], default: false }
})

const BASE = '/illustrations/spot/'
const STEP = [128, 192, 320]
// Motiver der ballen er et eget lag, så den kan stå nederst til høyre uansett motiv.
const MED_BALL = new Set(['match', 'training', 'skills', 'passing', 'match-red', 'match-green', 'match-white'])
const MOTION = {
  stats: 'bars',
  import: 'import',
  passing: 'pass',
  'match-red': 'roll',
  'match-green': 'roll',
  'match-white': 'roll'
}
const LAG = { stats: ['stats-lavender', 'stats-rose', 'stats-teal'] }
const UNDERLAG = { import: 'import-blank' }

const lag = computed(() => LAG[props.name] || null)
const base = computed(() => UNDERLAG[props.name] || props.name)
const medBall = computed(() => MED_BALL.has(props.name))
const motion = computed(() => MOTION[props.name] || 'none')

function srcset(id, fmt) {
  return STEP.map(s => `${BASE}${id}-${s}.${fmt} ${s}w`).join(', ')
}
const sizes = computed(() => `${props.size}px`)
const barSizes = computed(() => `${Math.round(props.size * 0.31)}px`)

const root = ref(null)
const playing = ref(false)
let observer = null
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Vent til bildene er dekodet, ellers kan bevegelsen gå ferdig før motivet
// i det hele tatt vises.
async function start() {
  const imgs = [...(root.value?.querySelectorAll('img') || [])]
  await Promise.all(imgs.map(img => img.decode?.().catch(() => {})))
  if (!document.hidden) playing.value = true
}

function onHidden() {
  if (document.hidden) playing.value = false
}

onMounted(() => {
  if (props.play === true) playing.value = true
  document.addEventListener('visibilitychange', onHidden)
  if (props.play !== 'auto' || reduced() || !('IntersectionObserver' in window)) return
  observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return
    observer?.disconnect()
    start()
  }, { threshold: 0.4 })
  if (root.value) observer.observe(root.value)
})

watch(() => props.play, v => {
  if (v === true) playing.value = true
  else if (v === false) playing.value = false
})

onBeforeUnmount(() => {
  observer?.disconnect()
  document.removeEventListener('visibilitychange', onHidden)
})
</script>

<template>
  <span
    ref="root"
    class="spot"
    :class="{ 'spot--playing': playing }"
    :data-motion="motion"
    aria-hidden="true"
  >
    <span v-if="lag" class="spot__bars">
      <picture v-for="l in lag" :key="l">
        <source type="image/avif" :srcset="srcset(l, 'avif')" :sizes="barSizes" />
        <img :srcset="srcset(l, 'webp')" :sizes="barSizes" :src="`${BASE}${l}-192.webp`" alt="" decoding="async" />
      </picture>
    </span>
    <template v-else>
      <picture class="spot__base">
        <source type="image/avif" :srcset="srcset(base, 'avif')" :sizes="sizes" />
        <img :srcset="srcset(base, 'webp')" :sizes="sizes" :src="`${BASE}${base}-192.webp`" alt="" decoding="async" />
      </picture>
      <picture v-if="medBall" class="spot__ball">
        <source type="image/avif" :srcset="srcset('ball', 'avif')" :sizes="sizes" />
        <img :srcset="srcset('ball', 'webp')" :sizes="sizes" :src="`${BASE}ball-192.webp`" alt="" decoding="async" />
      </picture>
      <svg v-if="name === 'import'" class="spot__symbol" viewBox="0 0 100 100">
        <path d="M35 10 Q35 5 40 5 H60 Q65 5 65 10 V48 H85 Q95 48 87 58 L57 90 Q50 98 43 90 L13 58 Q5 48 15 48 H35Z" fill="currentColor" />
      </svg>
    </template>
  </span>
</template>

<style scoped>
.spot {
  position: relative;
  display: block;
  width: var(--spot-size, 96px);
  aspect-ratio: 1;
  flex: none;
  isolation: isolate;
}

.spot picture,
.spot img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Ballen som eget lag, nederst til høyre. Selektoren må slå `.spot picture`
   over, ellers arver ballen 100 % og dekker motivet. */
.spot > picture.spot__ball {
  position: absolute;
  width: 43%;
  height: 43%;
  right: -1%;
  bottom: 1%;
}

/* Pasning: ballen går BAK portene, så porten ligger over ballen. */
.spot[data-motion="pass"] > picture.spot__base { position: relative; z-index: 2; }
.spot[data-motion="pass"] > picture.spot__ball {
  width: 18%;
  height: 18%;
  right: 21%;
  bottom: 44%;
  z-index: 1;
}

/* Statistikk: tre søyler, hver sitt lag, så de kan vokse hver for seg. */
.spot__bars {
  position: absolute;
  inset: 10% 9% 12%;
  display: flex;
  gap: 4%;
  align-items: flex-end;
}

.spot__bars > picture {
  width: 30.666%;
  height: 100%;
  transform-origin: center bottom;
}

.spot__bars > picture:nth-child(1) { height: 45%; }
.spot__bars > picture:nth-child(2) { height: 70%; }
.spot__bars img { object-fit: fill; }

/* Import: pila er et symbol over kalenderen uten pil, så den kan komme ned. */
.spot__symbol {
  position: absolute;
  display: block;
  width: 25%;
  height: 25%;
  left: 44%;
  top: 61%;
  color: #034f46;
  transform-origin: center;
}

@media (prefers-reduced-motion: no-preference) {
  .spot--playing[data-motion="bars"] .spot__bars > picture {
    animation: spot-bars 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .spot--playing[data-motion="bars"] .spot__bars > picture:nth-child(2) { animation-delay: 100ms; }
  .spot--playing[data-motion="bars"] .spot__bars > picture:nth-child(3) { animation-delay: 200ms; }
  .spot--playing[data-motion="pass"] > picture.spot__ball {
    animation: spot-pass 1100ms cubic-bezier(0.2, 0.55, 0.35, 1) both;
  }
  .spot--playing[data-motion="roll"] > picture.spot__ball {
    animation: spot-roll 900ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  .spot--playing[data-motion="import"] .spot__symbol {
    animation: spot-import 650ms cubic-bezier(0.2, 0.75, 0.3, 1) both;
  }
}

@keyframes spot-bars {
  from { transform: scaleY(0.18); }
  to { transform: scaleY(1); }
}

@keyframes spot-pass {
  from { transform: translate(-180%, 145%) rotate(-230deg) scale(1.15); }
  to { transform: none; }
}

/* Ballen ruller inn fra venstre og legger seg ved drakta. Opasiteten gjør
   at den ikke dukker opp midt i teksten ved siden av. */
@keyframes spot-roll {
  from { transform: translateX(-120%) rotate(-240deg); opacity: 0; }
  30% { opacity: 1; }
  to { transform: none; opacity: 1; }
}

@keyframes spot-import {
  from { transform: translateY(-55%); opacity: 0; }
  25% { opacity: 1; }
  to { transform: none; opacity: 1; }
}
</style>
