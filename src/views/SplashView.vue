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

let leaveTimer = null
let safetyTimer = null
let outroTimer = null

const OUTRO_HOLD_MS = 1400

function startOutro() {
  if (outroVisible.value || leaving.value) return
  outroVisible.value = true
  videoFading.value = true
  outroTimer = setTimeout(leave, OUTRO_HOLD_MS)
}

function leave() {
  if (leaving.value) return
  leaving.value = true
  leaveTimer = setTimeout(() => {
    router.replace(isLoggedIn.value ? '/' : '/login')
  }, 500)
}

onMounted(() => {
  // Safety net: if video fails to load or `ended` never fires, leave anyway.
  safetyTimer = setTimeout(startOutro, 6500)

  const v = videoEl.value
  if (v) {
    v.play().catch(() => {
      // Autoplay blocked — skip splash rather than show a frozen frame.
      leave()
    })
  }
})

onBeforeUnmount(() => {
  clearTimeout(leaveTimer)
  clearTimeout(safetyTimer)
  clearTimeout(outroTimer)
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
      @canplay="ready = true"
      @ended="startOutro"
      @error="leave"
    />

    <div class="splash__outro" :class="{ 'splash__outro--in': outroVisible }">
      <p class="splash__welcome">Velkommen til</p>
      <h1 class="splash__title">
        Bench<span class="splash__accent">Boss</span>
      </h1>
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
  background: var(--ds-color-bg);
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
  transition: opacity 0.4s ease;
}

.splash--ready .splash__video {
  opacity: 1;
}

.splash--video-fading .splash__video {
  opacity: 0;
  transform: scale(1.06);
  transition: opacity 0.7s ease, transform 1.2s ease;
}

.splash__outro {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--ds-color-bg);
  opacity: 0;
  transition: opacity 0.6s ease;
  pointer-events: none;
}

.splash__outro--in {
  opacity: 1;
}

.splash__welcome {
  font-family: var(--ds-font-heading);
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--ds-color-text-secondary);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin: 0 0 10px;
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.5s ease 0.15s, transform 0.5s ease 0.15s;
}

.splash__outro--in .splash__welcome {
  opacity: 1;
  transform: translateY(0);
}

.splash__title {
  font-family: var(--ds-font-heading);
  font-size: clamp(2.4rem, 9vw, 3.4rem);
  font-weight: 900;
  color: var(--ds-color-text-primary);
  letter-spacing: -0.025em;
  line-height: 1;
  margin: 0;
  text-align: center;
  opacity: 0;
  transform: translateY(20px) scale(0.96);
  transition: opacity 0.55s ease 0.3s, transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s;
}

.splash__outro--in .splash__title {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.splash__accent {
  color: var(--ds-color-accent);
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
  .splash__video {
    transition: opacity 0.2s ease;
  }
}
</style>
