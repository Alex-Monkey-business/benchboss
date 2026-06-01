<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useCoaches } from '../composables/useCoaches'
import PinInput from '../components/PinInput.vue'

const route = useRoute()
const router = useRouter()
const { login } = useAuth()
const { coaches, fetchCoaches } = useCoaches()

// Delt foreldre-PIN (kan settes via VITE_PARENT_PIN). Foreldre får ren
// lesetilgang til cupen – ingen navnevalg, de sendes rett til kampoversikten.
const PARENT_PIN = import.meta.env.VITE_PARENT_PIN || '2025'

// 'pin' → 'profile'. Trener-PIN viser profilvelgeren; foreldre-PIN logger
// rett inn som leser.
const step = ref('pin')
const pinError = ref(false)
const pinRef = ref(null)

// Track image preload — block step transition until photos are decoded,
// so cards don't fade in with empty silhouettes.
let preloadPromise = Promise.resolve()

onMounted(async () => {
  await fetchCoaches()
  preloadPromise = Promise.all(
    coaches.value
      .filter(c => c.image)
      .map(c => {
        const img = new Image()
        img.src = c.image
        return img.decode?.().catch(() => {}) ?? Promise.resolve()
      })
  )
})

async function onPinComplete(pin) {
  const isCoachPin = coaches.value.some(c => c.pin === pin)
  const isParentPin = pin === PARENT_PIN

  if (isCoachPin) {
    // Wait up to 700ms for images; usually they're done long before user finishes PIN
    await Promise.race([preloadPromise, new Promise(r => setTimeout(r, 700))])
    step.value = 'profile'
  } else if (isParentPin) {
    // Forelder: ren lesetilgang, rett til kampoversikten.
    login({ id: 'parent', name: 'Forelder', role: 'parent' })
    router.push('/cup')
  } else {
    pinError.value = true
    setTimeout(() => {
      pinError.value = false
      pinRef.value?.clear()
    }, 600)
  }
}

function selectCoach(c) {
  login({ id: c.id, name: c.name, role: 'coach' })
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  router.push(redirect)
}
</script>

<template>
  <div class="login-screen">
    <Transition name="step-fade" mode="out-in">

      <!-- STEP 1 — Shared PIN -->
      <div v-if="step === 'pin'" key="pin" class="login-step">
        <div class="login-step__top">
          <h1 class="login-title">BenchBoss</h1>
          <p class="login-hint">Skriv inn PIN-kode (trener eller forelder)</p>
        </div>
        <div class="login-pin">
          <PinInput ref="pinRef" :error="pinError" @complete="onPinComplete" />
          <Transition name="ds-fade">
            <p v-if="pinError" class="login-error">Feil PIN-kode</p>
          </Transition>
        </div>
      </div>

      <!-- STEP 2 — Coach profile picker -->
      <div v-else key="profile" class="login-step login-step--profile">
        <h1 class="login-title login-title--profile">Hvem er du?</h1>
        <div class="profile-grid">
          <button
            v-for="c in coaches"
            :key="c.id"
            type="button"
            :data-coach="c.name.toLowerCase()"
            class="profile-card"
            @click="selectCoach(c)"
          >
            <div class="profile-card__avatar">
              <img
                v-if="c.image"
                :src="c.image"
                :alt="c.name"
                class="profile-card__avatar-img"
                decoding="async"
              />
              <span v-else class="profile-card__initial">{{ c.name.charAt(0) }}</span>
            </div>
            <span class="profile-card__name">{{ c.name }}</span>
          </button>
        </div>
      </div>

    </Transition>
  </div>
</template>

<style scoped>
/* Per-coach palette */
.profile-card[data-coach="alex"]  { --coach-bg: #F8E8E0; --coach-text: #7A3A24; }
.profile-card[data-coach="iver"]  { --coach-bg: #E2EDDE; --coach-text: #3D5C44; }
.profile-card[data-coach="jacob"] { --coach-bg: #D6DDEF; --coach-text: #3D456B; }
.profile-card[data-coach="simon"] { --coach-bg: #F0E7D6; --coach-text: #6B5630; }
.profile-card[data-coach="trond"] { --coach-bg: #DDE6EC; --coach-text: #3A4C5C; }

:global([data-theme="dark"]) .profile-card[data-coach="alex"]  { --coach-bg: #2A1E18; --coach-text: #F4C4A8; }
:global([data-theme="dark"]) .profile-card[data-coach="iver"]  { --coach-bg: #1A241D; --coach-text: #B5D2B0; }
:global([data-theme="dark"]) .profile-card[data-coach="jacob"] { --coach-bg: #1A1F33; --coach-text: #B9C2E5; }
:global([data-theme="dark"]) .profile-card[data-coach="simon"] { --coach-bg: #2A241A; --coach-text: #D9C99E; }
:global([data-theme="dark"]) .profile-card[data-coach="trond"] { --coach-bg: #1A222A; --coach-text: #B0C5D8; }

/* Dark mode: gradient bottom stays dark + stronger figure shadow */
:global([data-theme="dark"]) .profile-card__avatar-img {
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.45));
}

:global([data-theme="dark"]) .profile-card::after {
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.75) 100%
  );
}

.login-screen {
  min-height: 100dvh;
  background: var(--ds-color-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ds-space-xl) var(--ds-space-lg) calc(var(--ds-space-xl) + env(safe-area-inset-bottom, 0px));
}

.login-step {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-2xl);
}

.login-step--profile {
  max-width: 520px;
}

.login-step__top {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.login-title {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-3xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  color: var(--ds-color-text-primary);
  line-height: var(--ds-leading-tight);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0;
}

.login-title--profile {
  font-size: var(--ds-text-2xl);
}

.login-hint {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  margin: 0;
}

.login-pin {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-md);
}

.login-error {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-error);
  margin: 0;
}

/* ---- Profile grid (Netflix-style — wrapped rows are centered) ---- */
.profile-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--ds-space-md);
  width: 100%;
}

.profile-card {
  flex: 0 0 calc((100% - var(--ds-space-md) * 2) / 3);
  max-width: 140px;
}

@media (max-width: 380px) {
  .profile-grid { gap: var(--ds-space-sm); }
  .profile-card {
    flex-basis: calc((100% - var(--ds-space-sm) * 2) / 3);
  }
}

.profile-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  background: var(--coach-bg, var(--ds-color-warm-bg));
  box-shadow: var(--ds-shadow-xs);
  cursor: pointer;
  overflow: hidden;
  aspect-ratio: 4 / 5;
  font-family: var(--ds-font-body);
  -webkit-tap-highlight-color: transparent;
  transition:
    transform var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out),
    box-shadow var(--ds-duration-fast) var(--ds-ease-out);
  animation: profile-card-in 420ms var(--ds-ease-smooth) both;
}

.profile-card:nth-child(1) { animation-delay: 40ms; }
.profile-card:nth-child(2) { animation-delay: 90ms; }
.profile-card:nth-child(3) { animation-delay: 140ms; }
.profile-card:nth-child(4) { animation-delay: 190ms; }
.profile-card:nth-child(5) { animation-delay: 240ms; }
.profile-card:nth-child(n+6) { animation-delay: 280ms; }

@keyframes profile-card-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .profile-card {
    animation: none;
  }
}

@media (hover: hover) and (pointer: fine) {
  .profile-card:hover {
    border-color: var(--ds-color-border-strong);
    box-shadow: var(--ds-shadow-sm);
    transform: translateY(-1px);
  }
}

.profile-card:active {
  transform: scale(0.97);
}

/* Image anchored at bottom with breathing room on top.
   Name overlays bottom of image with a SHORT, subtle gradient
   just behind the text — enough for legibility, no haze on the figure. */
.profile-card__avatar {
  position: absolute;
  inset: 0;
  padding-top: 14px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
}

.profile-card__avatar-img {
  display: block;
  max-width: 100%;
  width: auto;
  height: 100%;
  object-fit: contain;
  object-position: center bottom;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.15));
}

.profile-card__initial {
  margin: auto;
  font-family: var(--ds-font-display-sans);
  font-size: 56px;
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.03em;
  color: var(--coach-text, var(--ds-color-warm-text));
}

/* Short dark scrim behind the name — bottom 32% of card */
.profile-card::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 32%;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.65) 100%
  );
  z-index: 1;
  pointer-events: none;
}

.profile-card__name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10px 8px 10px;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.005em;
  color: #ffffff;
  text-align: center;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  z-index: 2;
}

/* ---- Step transition ---- */
.step-fade-enter-active {
  transition:
    opacity 220ms var(--ds-ease-out),
    transform 220ms var(--ds-ease-out);
}
.step-fade-leave-active {
  transition:
    opacity 140ms var(--ds-ease-out),
    transform 140ms var(--ds-ease-out);
}
.step-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.step-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .step-fade-enter-active,
  .step-fade-leave-active {
    transition: opacity 100ms;
  }
  .step-fade-enter-from,
  .step-fade-leave-to {
    transform: none;
  }
}
</style>
