<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const ball = ref(null)
const logo = ref(null)
let settle
let bounce
let taps = 0
const hint = ref(false)
let dismissed = false
let revealHint
let hideHint
onMounted(() => {
  revealHint = setTimeout(() => { if (!dismissed) hint.value = true }, 1800)
  hideHint = setTimeout(() => { hint.value = false }, 6800)
})
function kick() {
  dismissed = true
  hint.value = false
  const start = ball.value ? getComputedStyle(ball.value).transform : 'none'
  bounce?.cancel()
  settle?.cancel()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    bounce = ball.value.animate([{ opacity: .6 }, { opacity: 1 }], { duration: 160 })
    return
  }
  const direction = ++taps % 2 ? 1 : -1
  bounce = ball.value.animate([
    { transform: start === 'none' ? 'translate(0, 0) rotate(0deg)' : start, offset: 0, easing: 'cubic-bezier(.16,.7,.3,1)' },
    { transform: `translate(${direction * 12}px, -42px) rotate(${direction * 50}deg)`, offset: .43, easing: 'cubic-bezier(.55,0,.85,.4)' },
    { transform: `translate(0, 0) rotate(${direction * 125}deg) scale(1.025,.975)`, offset: .77, easing: 'ease-out' },
    { transform: `translate(0, -5px) rotate(${direction * 138}deg)`, offset: .87, easing: 'ease-in' },
    { transform: `translate(0, 0) rotate(${direction * 144}deg)`, offset: 1 },
  ], { duration: 1150 })
  settle = logo.value.animate([
    { transform: 'translateY(0) scale(1)' },
    { transform: 'translateY(1.5px) scale(.995,1.01)', offset: .12 },
    { transform: 'translateY(-1px) scale(1.005,.995)', offset: .5 },
    { transform: 'translateY(0) scale(1)' },
  ], { duration: 480, easing: 'ease-out' })
}
onBeforeUnmount(() => { bounce?.cancel(); settle?.cancel(); clearTimeout(revealHint); clearTimeout(hideHint) })
</script>

<template>
  <div class="bench-brand">
    <Transition name="ball-hint">
      <span v-if="hint" class="bench-ball-hint" aria-hidden="true">
        Tæpp på ballen
        <svg width="24" height="23" viewBox="0 0 24 23" fill="none">
          <path d="M2 2c12-2 18 4 17 17m-5-5 5 5 4-6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </Transition>
    <button class="bench-ball" type="button" aria-label="Vipp fotballen" @click="kick">
      <svg ref="ball" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="#faf9f5" stroke="currentColor" stroke-opacity=".65" stroke-width="1.4" />
        <g stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">
          <path d="m32 21 10.5 7.6-4 12.4h-13l-4-12.4Z" fill="currentColor" fill-opacity=".72" stroke-opacity=".72" />
          <path d="M32 21V11M42.5 28.6 52 25M38.5 41l6 9M25.5 41l-6 9M21.5 28.6 12 25" fill="none" stroke-opacity=".38" />
          <path d="m24 5 8-1 8 1-3 6H27ZM54 15l5 10 1 7-8-3-2-8ZM55 48l-9 9-8 3 2-9 8-5ZM26 60l-8-3-9-9 7-2 8 5ZM4 32l1-7 5-10 4 6-2 8Z" fill="currentColor" fill-opacity=".16" stroke-opacity=".3" />
        </g>
      </svg>
    </button>
    <div ref="logo" class="bench-wordmark" role="img" aria-label="BenchBoss"></div>
  </div>
</template>

<style scoped>
.bench-brand {
  /* Merkets farge — ordmerket og ballen leser den SAMME variabelen, så de
     kan ikke drifte fra hverandre. Standard lys overstyrer den én gang
     under, alt annet følger text-primary. */
  --merke: var(--ds-color-text-primary);
  position: relative;
  width: min(200px, 60vw);

  animation: brand-arrive 1100ms cubic-bezier(.22, 1, .36, 1) both;
}
/* Ordmerket er en alfamaske, ikke et bilde. Fargen kommer fra
   --ds-color-text-primary, som allerede skifter med tema OG palett — så de
   seks feColorMatrix-filtrene (tre paletter ganger lys og mørk) er borte, og
   det samme er den synlige firkanten rundt et PNG med papirbakgrunn. */
.bench-wordmark {
  display: block;
  width: 100%;
  aspect-ratio: 1123 / 600;
  background: var(--merke);
  -webkit-mask: url('/brand/bench-boss-wordmark.png') center / contain no-repeat;
  mask: url('/brand/bench-boss-wordmark.png') center / contain no-repeat;

  transform-origin: 50% 55%;
  animation: brand-settle 1500ms 180ms both;
}


/* Standard i lys modus: blekk, ikke teal. Teal er overskriftsfargen i det
   designet, men merket er merket — likt uansett palett rundt. Mørk modus og
   Whspr følger text-primary, som allerede er blekk eller krem der. */
:global(html:not([data-design="whspr"]):not([data-theme="dark"]) .bench-brand) { --merke: #1a1a1a; }

.bench-ball {
  position: absolute;
  z-index: 1;
  top: -42px;
  right: -2px;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  padding: 7px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--merke);
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.bench-ball svg { display: block; width: 25px; height: 25px; }

.bench-ball:focus-visible { outline: 2px solid var(--merke); outline-offset: 2px; }

.bench-ball-hint { position: absolute; right: 52px; top: -62px; color: var(--ds-color-text-secondary); font: 11px var(--ds-font-body); white-space: nowrap; pointer-events: none; }
.bench-ball-hint svg { position: absolute; left: calc(100% + 5px); top: 3px; }
.ball-hint-enter-active, .ball-hint-leave-active { transition: opacity 300ms ease, transform 300ms ease; }
.ball-hint-enter-from, .ball-hint-leave-to { opacity: 0; transform: translateY(3px); }

/* A single gentle settling movement, pivoting around the bench seat.
   No perpetual motion beside the login form. */
@keyframes brand-arrive {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes brand-settle {
  0% { transform: rotate(-.65deg) translateY(-2px); animation-timing-function: cubic-bezier(.22, .8, .36, 1); }
  55% { transform: rotate(.2deg) translateY(1px); animation-timing-function: ease-out; }
  100% { transform: rotate(0) translateY(0); }
}
@media (max-height: 650px) {
  .bench-brand { width: min(180px, 55vw); }
}
@media (prefers-reduced-motion: reduce) {
  .bench-brand, .bench-wordmark { animation: none; }
  .ball-hint-enter-active, .ball-hint-leave-active { transition: opacity 100ms; }
  .ball-hint-enter-from, .ball-hint-leave-to { transform: none; }
}
</style>
