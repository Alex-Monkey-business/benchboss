<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'

const router = useRouter()
const { isLoggedIn } = useAuth()

const videoEl = ref(null)
const leaving = ref(false)
const ready = ref(false)
const outroVisible = ref(false)
const videoFading = ref(false)
const titleVisible = ref(false)

const TITLE_TARGET = ['B', 'e', 'n', 'c', 'h', 'B', 'o', 's', 's']
const ACCENT_FROM_INDEX = 5
const SCRAMBLE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

const TITLE_FADE_DELAY_MS = 300
const SCRAMBLE_INTERVAL_MS = 55
const LOCK_START_MS = 1400
const LOCK_STAGGER_MS = 120

const OUTRO_HOLD_MS = 1500
const PRE_OUTRO_MS = 1300

const ORIGINAL_THEME_COLOR = '#2563EB'
const SPLASH_THEME_COLOR = '#0A0A0A'
const OUTRO_THEME_COLOR = '#0A0A0A'

function randomChar() {
  return SCRAMBLE_CHARSET[Math.floor(Math.random() * SCRAMBLE_CHARSET.length)]
}

const allLetters = ref(
  TITLE_TARGET.map((target, i) => ({
    target,
    current: randomChar(),
    locked: false,
    accent: i >= ACCENT_FROM_INDEX,
  }))
)

let leaveTimer = null
let safetyTimer = null
let outroTimer = null
let preOutroTimer = null
let titleTimer = null
let scrambleStartTimer = null
let scrambleInterval = null
const lockTimers = []

function setThemeColor(color) {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', color)
}

function startScramble() {
  scrambleInterval = setInterval(() => {
    allLetters.value = allLetters.value.map((l) =>
      l.locked ? l : { ...l, current: randomChar() }
    )
  }, SCRAMBLE_INTERVAL_MS)

  TITLE_TARGET.forEach((target, i) => {
    const lockMs = LOCK_START_MS + i * LOCK_STAGGER_MS
    const t = setTimeout(() => {
      allLetters.value = allLetters.value.map((l, idx) =>
        idx === i ? { ...l, current: target, locked: true } : l
      )
      if (allLetters.value.every((l) => l.locked) && scrambleInterval) {
        clearInterval(scrambleInterval)
        scrambleInterval = null
      }
    }, lockMs)
    lockTimers.push(t)
  })
}

function startOutro() {
  if (outroVisible.value || leaving.value) return
  outroVisible.value = true
  videoFading.value = true
  setThemeColor(OUTRO_THEME_COLOR)
  outroTimer = setTimeout(leave, OUTRO_HOLD_MS)
}

function leave() {
  if (leaving.value) return
  leaving.value = true
  leaveTimer = setTimeout(() => {
    setThemeColor(ORIGINAL_THEME_COLOR)
    router.replace(isLoggedIn.value ? '/' : '/login')
  }, 500)
}

onMounted(() => {
  setThemeColor(SPLASH_THEME_COLOR)
  safetyTimer = setTimeout(startOutro, 7000)

  const v = videoEl.value
  if (!v) return

  v.addEventListener(
    'canplay',
    () => {
      ready.value = true
      titleTimer = setTimeout(() => {
        titleVisible.value = true
        scrambleStartTimer = setTimeout(startScramble, 80)
      }, TITLE_FADE_DELAY_MS)
    },
    { once: true }
  )

  v.addEventListener(
    'loadedmetadata',
    () => {
      const ms = v.duration * 1000 - PRE_OUTRO_MS
      if (Number.isFinite(ms) && ms > 0) {
        preOutroTimer = setTimeout(startOutro, ms)
      }
    },
    { once: true }
  )

  v.play().catch(() => leave())
})

onBeforeUnmount(() => {
  clearTimeout(leaveTimer)
  clearTimeout(safetyTimer)
  clearTimeout(outroTimer)
  clearTimeout(preOutroTimer)
  clearTimeout(titleTimer)
  clearTimeout(scrambleStartTimer)
  if (scrambleInterval) clearInterval(scrambleInterval)
  lockTimers.forEach(clearTimeout)
  setThemeColor(ORIGINAL_THEME_COLOR)
})
</script>

<template>
  <div
    class="splash"
    :class="{
      'splash--leaving': leaving,
      'splash--ready': ready,
      'splash--video-fading': videoFading,
    }"
    @click="startOutro"
  >
    <video
      ref="videoEl"
      class="splash__video"
      src="/videos/splash.mp4"
      autoplay
      muted
      playsinline
      preload="auto"
      @ended="startOutro"
      @error="leave"
    />

    <div class="splash__bar splash__bar--top" aria-hidden="true" />
    <div class="splash__bar splash__bar--bottom" aria-hidden="true" />

    <div class="splash__scrim" :class="{ 'splash__scrim--in': titleVisible }" />

    <div class="splash__brand" :class="{ 'splash__brand--in': titleVisible }">
      <p
        class="splash__welcome"
        :class="{ 'splash__welcome--in': outroVisible }"
      >
        Velkommen til
      </p>
      <h1 class="splash__title" aria-label="BenchBoss">
        <span
          v-for="(letter, i) in allLetters"
          :key="i"
          class="splash__letter"
          :class="{
            'splash__letter--accent': letter.accent,
            'splash__letter--locked': letter.locked,
          }"
          aria-hidden="true"
          >{{ letter.current }}</span
        >
      </h1>
      <span
        class="splash__underline"
        :class="{ 'splash__underline--in': outroVisible }"
        aria-hidden="true"
      />
    </div>

    <button
      type="button"
      class="splash__skip"
      :class="{ 'splash__skip--in': ready, 'splash__skip--gone': outroVisible }"
      @click.stop="startOutro"
    >
      Hopp over
    </button>
  </div>
</template>

<style scoped>
.splash {
  position: fixed;
  inset: 0;
  background: #0A0A0A;
  overflow: hidden;
  cursor: pointer;
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.splash--leaving {
  opacity: 0;
  transform: scale(1.04);
}

.splash__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  opacity: 0;
  transition: opacity 0.5s ease;
}

.splash--ready .splash__video {
  opacity: 1;
}

.splash--video-fading .splash__video {
  opacity: 0;
  transform: scale(1.06);
  transition: opacity 1.3s ease, transform 1.6s ease;
}

/* Cinematic letterbox bars — slide in once video is ready, retract for outro. */
.splash__bar {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  background: #000;
  z-index: 4;
  transition: height 0.55s cubic-bezier(0.65, 0, 0.35, 1);
  pointer-events: none;
}

.splash__bar--top { top: 0; }
.splash__bar--bottom { bottom: 0; }

.splash--ready:not(.splash--video-fading) .splash__bar {
  height: 4vh;
}

/* Soft dark vignette behind the brand mark — lifts text off bright video frames. */
.splash__scrim {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      ellipse 90% 45% at center,
      rgba(0, 0, 0, 0.55) 0%,
      rgba(0, 0, 0, 0.3) 50%,
      transparent 78%
    );
  opacity: 0;
  transition: opacity 0.7s ease;
  pointer-events: none;
  z-index: 2;
}

.splash__scrim--in {
  opacity: 1;
}

.splash--video-fading .splash__scrim {
  opacity: 0;
  transition: opacity 1s ease;
}

/* Brand block — fades in over the playing video, stays through outro. */
.splash__brand {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 3;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.6s ease;
}

.splash__brand--in {
  opacity: 1;
}

.splash__welcome {
  font-family: var(--ds-font-heading);
  font-size: 0.85rem;
  font-weight: 500;
  color: rgba(255, 254, 248, 0.65);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  margin: 0 0 14px;
  opacity: 0;
  transform: translateY(8px);
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.6);
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.splash__welcome--in {
  opacity: 1;
  transform: translateY(0);
}

.splash__title {
  font-family: var(--ds-font-heading);
  font-size: clamp(2.4rem, 9vw, 3.4rem);
  font-weight: 900;
  color: #FFFEF8;
  letter-spacing: -0.025em;
  line-height: 1;
  margin: 0;
  text-align: center;
  display: flex;
}

.splash__letter {
  display: inline-block;
  min-width: 0.62em;
  text-align: center;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.7);
  /* Tiny lift the moment a letter locks — makes the resolution feel intentional. */
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

.splash__letter--locked {
  transform: translateY(-1px);
}

.splash__letter--accent {
  color: #60A5FA;
  text-shadow:
    0 2px 18px rgba(0, 0, 0, 0.7),
    0 0 24px rgba(96, 165, 250, 0.35);
}

.splash__underline {
  display: block;
  width: clamp(80px, 22vw, 140px);
  height: 3px;
  margin-top: 18px;
  background: #60A5FA;
  border-radius: 2px;
  box-shadow: 0 0 14px rgba(96, 165, 250, 0.4);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.6s cubic-bezier(0.65, 0, 0.35, 1) 0.4s;
}

.splash__underline--in {
  transform: scaleX(1);
}

.splash__skip {
  position: absolute;
  top: max(env(safe-area-inset-top, 0), 16px);
  right: 16px;
  font-family: var(--ds-font-body);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ds-color-text-inverse);
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.4s ease 0.6s;
  -webkit-tap-highlight-color: transparent;
  z-index: 5;
}

.splash__skip--in {
  opacity: 1;
}

.splash__skip--gone {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.splash__skip:hover,
.splash__skip:focus-visible {
  background: rgba(0, 0, 0, 0.65);
  outline: none;
}

@media (prefers-reduced-motion: reduce) {
  .splash,
  .splash__video,
  .splash__bar,
  .splash__welcome,
  .splash__underline,
  .splash__brand,
  .splash__scrim {
    transition-duration: 0.2s !important;
    transition-delay: 0s !important;
  }
}
</style>
