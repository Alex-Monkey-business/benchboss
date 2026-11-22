<script setup>
import Ikon from './Ikon.vue'
import { ref, computed } from 'vue'
import { usePwaInstall } from '../composables/usePwaInstall'

const props = defineProps({
  // Lift above the bottom nav when it's on screen, so they don't overlap.
  aboveNav: { type: Boolean, default: false }
})

const { isInstalled, iosBrowser } = usePwaInstall()

const DISMISS_KEY = 'iosInstallBannerDismissed'

// localStorage can throw in iOS private mode — never let that break the app.
function readDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}
const dismissed = ref(readDismissed())

const visible = computed(() => !isInstalled.value && !!iosBrowser && !dismissed.value)

// Copy per browser — Add to Home Screen lives in different places, and in an
// in-app webview it isn't reachable at all (must open in Safari first).
const COPY = {
  safari: {
    title: 'Legg BenchBoss på hjemskjermen',
    // Beskriver ikonet, ikke bare plasseringen: «nederst» er tvetydig når
    // appens egen bunnmeny ligger mellom banneret og Safaris verktøylinje.
    body: 'Trykk Del-knappen i Safari nederst — firkanten med pil opp — og velg «Legg til på Hjemskjerm».',
    pointDown: true
  },
  chrome: {
    title: 'Legg BenchBoss på hjemskjermen',
    body: 'Åpne Del-menyen og velg «Legg til på Hjemskjerm».',
    pointDown: false
  },
  edge: {
    title: 'Legg BenchBoss på hjemskjermen',
    body: 'Åpne Del-menyen og velg «Legg til på Hjemskjerm».',
    pointDown: false
  },
  firefox: {
    title: 'Legg BenchBoss på hjemskjermen',
    body: 'Åpne menyen og velg «Legg til på Hjemskjerm».',
    pointDown: false
  },
  webview: {
    title: 'Åpne i Safari for å installere',
    body: 'Trykk ⋯ og velg «Åpne i Safari» — der kan du legge BenchBoss på hjemskjermen.',
    pointDown: false
  }
}

const copy = computed(() => COPY[iosBrowser] || COPY.safari)

function dismiss() {
  dismissed.value = true
  try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode — dismiss for this session only */ }
}
</script>

<template>
  <Transition name="ios-banner">
    <div
      v-if="visible"
      class="ios-banner"
      :class="{ 'ios-banner--above-nav': aboveNav }"
      role="dialog"
      aria-label="Legg appen på hjemskjermen"
    >
      <img class="ios-banner__icon" src="/icons/icon-192.png" alt="" />
      <div class="ios-banner__body">
        <p class="ios-banner__title">{{ copy.title }}</p>
        <p class="ios-banner__text">
          {{ copy.body }}
          <Ikon navn="del" v-if="iosBrowser !== 'webview'" class="ios-banner__share" aria-hidden="true" />
        </p>
      </div>
      <button class="ds-icon-btn ios-banner__close" type="button" aria-label="Lukk" @click="dismiss">
        <Ikon navn="kryss" />
      </button>

      <!-- Pila peker på Safaris Del-knapp i verktøylinja nederst. Men er
           appens egen bunnmeny på skjermen, ligger DEN imellom — og da peker
           pila på en fane i stedet for på knappen. Verre enn ingen pil, for
           den ber deg trykke feil sted. Vises derfor bare uten bunnmeny. -->
      <span v-if="copy.pointDown && !aboveNav" class="ios-banner__arrow" aria-hidden="true">
        <Ikon navn="ned" vekt="bold" />
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.ios-banner {
  position: fixed;
  left: var(--ds-space-md);
  right: var(--ds-space-md);
  bottom: calc(var(--ds-space-md) + env(safe-area-inset-bottom, 0px));
  z-index: 200;
  display: flex;
  align-items: center;
  gap: var(--ds-space-12);
  padding: var(--ds-space-12) var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-lg);
}

/* Sit above the bottom nav (≈72px) when it's rendered. */
.ios-banner--above-nav {
  bottom: calc(72px + var(--ds-space-sm) + env(safe-area-inset-bottom, 0px));
}

.ios-banner__icon {
  width: 44px;
  height: 44px;
  border-radius: var(--ds-radius-md);
  flex-shrink: 0;
}

.ios-banner__body {
  flex: 1;
  min-width: 0;
}

.ios-banner__title {
  margin: 0;
  font-weight: var(--ds-weight-semibold);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.25;
}

.ios-banner__text {
  margin: var(--ds-space-2xs) 0 0;
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
  line-height: 1.35;
}

.ios-banner__share {
  display: inline-block;
  width: 14px;
  height: 14px;
  vertical-align: -2px;
  color: var(--ds-color-accent);
}

.ios-banner__close { align-self: flex-start; }

/* Bouncing pointer toward Safari's bottom share button. */
.ios-banner__arrow {
  position: absolute;
  bottom: -22px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--ds-color-accent);
  animation: ios-arrow-bob 1.4s ease-in-out infinite;
}

.ios-banner__arrow svg {
  width: 22px;
  height: 22px;
}

@keyframes ios-arrow-bob {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50%      { transform: translateX(-50%) translateY(5px); }
}

.ios-banner-enter-active,
.ios-banner-leave-active {
  transition: transform 0.3s var(--ds-ease-out), opacity 0.3s var(--ds-ease-out);
}

.ios-banner-enter-from,
.ios-banner-leave-to {
  transform: translateY(16px);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .ios-banner__arrow { animation: none; }
}
</style>
