<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useCoaches } from '../composables/useCoaches'
import PinInput from '../components/PinInput.vue'

const route = useRoute()
const router = useRouter()
const { login } = useAuth()
const { coaches, fetchCoaches, verifyPin } = useCoaches()

const selectedCoach = ref(null)
const pinError = ref(false)
const pinRef = ref(null)
// Skip enter animations until the user has actively switched coach.
// Otherwise initial mount animates before the image is decoded → jank.
const hasInteracted = ref(false)

const currentCoach = computed(() => coaches.value.find(c => c.id === selectedCoach.value))
const currentCoachKey = computed(() => currentCoach.value?.name?.toLowerCase())

onMounted(async () => {
  await fetchCoaches()
  if (coaches.value.length > 0) {
    selectedCoach.value = coaches.value[0].id
  }
  // Warm browser cache + decode pipeline for all coach photos so they
  // appear instantly the first time they're rendered.
  for (const c of coaches.value) {
    if (!c.image) continue
    const img = new Image()
    img.src = c.image
    img.decode?.().catch(() => {})
  }
})

function selectCoach(id) {
  if (id === selectedCoach.value) return
  hasInteracted.value = true
  selectedCoach.value = id
  pinError.value = false
  pinRef.value?.clear()
}

async function onPinComplete(pin) {
  const isValid = await verifyPin(selectedCoach.value, pin)
  if (isValid) {
    const coach = coaches.value.find(c => c.id === selectedCoach.value)
    login({ id: coach.id, name: coach.name })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(redirect)
  } else {
    pinError.value = true
    setTimeout(() => {
      pinError.value = false
      pinRef.value?.clear()
    }, 600)
  }
}
</script>

<template>
  <div class="login-screen">
    <div class="login-content">
      <h1 class="login-content__title">BenchBoss</h1>

      <!-- Big trading-card of selected coach -->
      <Transition name="card-swap" mode="out-in">
        <div
          :key="selectedCoach"
          :data-coach="currentCoachKey"
          :class="['login-card', { 'login-card--animated': hasInteracted }]"
        >
          <div class="login-card__avatar">
            <img
              v-if="currentCoach?.image"
              :src="currentCoach.image"
              :alt="currentCoach?.name"
              class="login-card__avatar-img"
              decoding="async"
              fetchpriority="high"
            />
            <span v-else class="login-card__initial">{{ currentCoach?.name?.charAt(0) || '?' }}</span>
          </div>
          <span class="login-card__name">{{ currentCoach?.name || '' }}</span>
        </div>
      </Transition>

      <!-- Coach picker with hint -->
      <span class="login-picker-label">Hvem er du?</span>
      <div class="login-picker" role="tablist" aria-label="Velg trener">
        <button
          v-for="c in coaches"
          :key="c.id"
          type="button"
          role="tab"
          :data-coach="c.name.toLowerCase()"
          :aria-selected="c.id === selectedCoach"
          :class="['login-picker__item', { 'login-picker__item--active': c.id === selectedCoach }]"
          @click="selectCoach(c.id)"
        >
          <img v-if="c.image" :src="c.image" :alt="c.name" class="login-picker__img" decoding="async" />
          <span v-else class="login-picker__initial">{{ c.name.charAt(0) }}</span>
        </button>
      </div>

      <!-- PIN -->
      <div class="login-content__form">
        <label class="login-pin-label">PIN-kode</label>
        <PinInput ref="pinRef" :error="pinError" @complete="onPinComplete" />
        <Transition name="ds-fade">
          <p v-if="pinError" class="ds-help ds-help--error login-error">
            Feil PIN-kode
          </p>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Per-coach color tokens — mirror the match-detail picker */
.login-card[data-coach="alex"]  { --coach-bg: #F8E8E0; --coach-text: #7A3A24; }
.login-card[data-coach="iver"]  { --coach-bg: #E2EDDE; --coach-text: #3D5C44; }
.login-card[data-coach="jacob"] { --coach-bg: #D6DDEF; --coach-text: #3D456B; }
.login-card[data-coach="simon"] { --coach-bg: #F0E7D6; --coach-text: #6B5630; }
.login-card[data-coach="trond"] { --coach-bg: #DDE6EC; --coach-text: #3A4C5C; }

.login-picker__item[data-coach="alex"]  { --coach-bg: #F8E8E0; --coach-text: #7A3A24; }
.login-picker__item[data-coach="iver"]  { --coach-bg: #E2EDDE; --coach-text: #3D5C44; }
.login-picker__item[data-coach="jacob"] { --coach-bg: #D6DDEF; --coach-text: #3D456B; }
.login-picker__item[data-coach="simon"] { --coach-bg: #F0E7D6; --coach-text: #6B5630; }
.login-picker__item[data-coach="trond"] { --coach-bg: #DDE6EC; --coach-text: #3A4C5C; }

.login-screen {
  min-height: 100dvh;
  background: var(--ds-color-bg);
  position: relative;
  overflow: hidden;
  transition: background-color 400ms var(--ds-ease-smooth);
}

/* Ambient bg — soft tint of selected coach's color (Apple TV+ profile-style) */
.login-screen:has(.login-card[data-coach="alex"])  { background: color-mix(in srgb, #F8E8E0 45%, white); }
.login-screen:has(.login-card[data-coach="iver"])  { background: color-mix(in srgb, #E2EDDE 45%, white); }
.login-screen:has(.login-card[data-coach="jacob"]) { background: color-mix(in srgb, #D6DDEF 45%, white); }
.login-screen:has(.login-card[data-coach="simon"]) { background: color-mix(in srgb, #F0E7D6 45%, white); }
.login-screen:has(.login-card[data-coach="trond"]) { background: color-mix(in srgb, #DDE6EC 45%, white); }

@media (prefers-reduced-motion: reduce) {
  .login-screen { transition: none; }
}

.login-content {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--ds-space-xl) var(--ds-space-lg) calc(var(--ds-space-xl) + env(safe-area-inset-bottom, 0px));
  gap: var(--ds-space-xl);
  transition: gap 220ms var(--ds-ease-out);
}

/* Short viewports — laptop or mobile in landscape */
@media (max-height: 720px) {
  .login-content { gap: var(--ds-space-lg); }
}

/* Compact when PIN is focused (keyboard up) — shrink card + tighten gaps */
.login-content:has(.login-content__form :focus-within) {
  gap: var(--ds-space-md);
  padding-top: var(--ds-space-md);
  justify-content: flex-start;
}

.login-content:has(.login-content__form :focus-within) .login-card {
  width: 132px;
  border-radius: 16px;
  box-shadow: var(--ds-shadow-sm);
}

.login-content:has(.login-content__form :focus-within) .login-card__name {
  padding: 10px 8px 8px;
  font-size: var(--ds-text-sm);
}

.login-content:has(.login-content__form :focus-within) .login-card__initial {
  font-size: 58px;
}

.login-content:has(.login-content__form :focus-within) .login-picker-label {
  display: none;
}

.login-content:has(.login-content__form :focus-within) .login-picker {
  gap: 8px;
}

.login-content:has(.login-content__form :focus-within) .login-picker__item {
  width: 36px;
  height: 36px;
  border-radius: 10px;
}

.login-content__title {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-2xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  color: var(--ds-color-text-primary);
  text-align: center;
  line-height: var(--ds-leading-tight);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0;
}

/* ---- Big trading card ---- */
.login-card {
  position: relative;
  width: 220px;
  aspect-ratio: 4 / 5;
  border-radius: 22px;
  background: var(--coach-bg, var(--ds-color-warm-bg));
  border: 1px solid var(--ds-color-border);
  box-shadow: var(--ds-shadow-md);
  overflow: hidden;
  transition:
    width 240ms var(--ds-ease-out),
    border-radius 240ms var(--ds-ease-out),
    box-shadow 240ms var(--ds-ease-out);
}

/* Short viewports — slightly smaller hero card */
@media (max-height: 720px) {
  .login-card { width: 180px; }
}

.login-card::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 60%;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--coach-text, #0A0A0A) 0%, transparent) 0%,
    color-mix(in srgb, var(--coach-text, #0A0A0A) 55%, transparent) 55%,
    color-mix(in srgb, var(--coach-text, #0A0A0A) 96%, transparent) 100%
  );
  z-index: 1;
  pointer-events: none;
}

.login-card__avatar {
  position: absolute;
  inset: 0;
  padding-top: 18px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
}

.login-card__avatar-img {
  display: block;
  max-width: 100%;
  width: auto;
  height: 100%;
  object-fit: contain;
  object-position: center bottom;
  filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.22));
}

.login-card__initial {
  margin: auto;
  font-family: var(--ds-font-display-sans);
  font-size: 96px;
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.03em;
  color: var(--coach-text, var(--ds-color-warm-text));
}

/* Animate figure on coach swap, but NOT on initial mount (would run before
   image is decoded → jank) */
.login-card--animated .login-card__avatar-img,
.login-card--animated .login-card__initial {
  animation: login-card-figure-in 500ms var(--ds-ease-smooth) both;
  animation-delay: 120ms;
}

@keyframes login-card-figure-in {
  from { transform: scale(1.05); opacity: 0.85; }
  to   { transform: scale(1); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .login-card--animated .login-card__avatar-img,
  .login-card--animated .login-card__initial {
    animation: none;
  }
}

.login-card__name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 18px 12px 16px;
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.01em;
  color: #ffffff;
  text-align: center;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55), 0 0 8px rgba(0, 0, 0, 0.25);
  z-index: 2;
}

/* ---- Horizontal picker row ---- */
.login-picker {
  display: flex;
  align-items: center;
  gap: 12px;
}

.login-picker__item {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border: 1px solid var(--ds-color-border);
  background: var(--coach-bg, var(--ds-color-bg-subtle));
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  padding: 2px 0 0;
  transition:
    transform var(--ds-duration-fast) var(--ds-ease-out),
    border-color var(--ds-duration-fast) var(--ds-ease-out),
    box-shadow var(--ds-duration-fast) var(--ds-ease-out);
  -webkit-tap-highlight-color: transparent;
}

.login-picker__item:active {
  transform: scale(0.95);
}

.login-picker__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center bottom;
}

.login-picker__initial {
  margin: auto;
  font-family: var(--ds-font-display-sans);
  font-size: 18px;
  font-weight: var(--ds-weight-semibold);
  color: var(--coach-text, var(--ds-color-text-secondary));
}

.login-picker__item--active {
  border-color: var(--ds-color-accent);
  box-shadow: 0 0 0 2px var(--ds-color-accent), var(--ds-shadow-sm);
}

/* ---- Card swap transition ---- */
.card-swap-enter-active {
  transition:
    opacity 240ms var(--ds-ease-out),
    transform 240ms var(--ds-ease-out);
}
.card-swap-leave-active {
  transition:
    opacity 140ms var(--ds-ease-out),
    transform 140ms var(--ds-ease-out);
}
.card-swap-enter-from {
  opacity: 0;
  transform: scale(0.94) translateY(6px);
}
.card-swap-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .card-swap-enter-active,
  .card-swap-leave-active {
    transition: opacity 100ms;
  }
  .card-swap-enter-from,
  .card-swap-leave-to {
    transform: none;
  }
}

/* ---- Form ---- */
.login-content__form {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.login-pin-label,
.login-picker-label {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  margin-bottom: 12px;
}

.login-picker-label {
  margin-bottom: 0;
  margin-top: -8px;
}

.login-error {
  text-align: center;
  margin-top: 12px;
}
</style>
