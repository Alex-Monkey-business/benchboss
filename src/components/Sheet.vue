<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' }
})

const emit = defineEmits(['close'])

const isMobile = ref(false)
const bodyRef = ref(null)
const scrollRef = ref(null)

// Dra ned for å lukke — standard for et ark på mobil, ikke bare krysset.
// Draget starter bare når innholdet står øverst (scrollTop 0) eller fingeren
// ligger på header/film; ellers er det innholdet som skal scrolle. Slippes
// arket forbi terskelen, eller raskt nok, lukkes det; ellers glir det tilbake.
const dragY = ref(0)
const dragging = ref(false)
let touch = null

function onTouchStart(e) {
  if (!isMobile.value || e.touches.length !== 1) return
  const t = e.touches[0]
  const scroller = scrollRef.value || bodyRef.value
  const inScroller = scroller && scroller.contains(e.target)
  const atTop = !scroller || scroller.scrollTop <= 0
  touch = { x: t.clientX, y: t.clientY, t: performance.now(), kan: !inScroller || atTop, aktiv: false }
}

function onTouchMove(e) {
  if (!touch || !touch.kan) return
  const t = e.touches[0]
  const dy = t.clientY - touch.y
  const dx = t.clientX - touch.x
  if (!touch.aktiv) {
    if (dy < 8 || Math.abs(dx) > Math.abs(dy)) { if (dy < -4 || Math.abs(dx) > 12) touch.kan = false; return }
    touch.aktiv = true
    dragging.value = true
  }
  e.preventDefault()
  dragY.value = Math.max(0, dy)
}

function onTouchEnd() {
  if (!touch) return
  const dur = Math.max(1, performance.now() - touch.t)
  const fart = dragY.value / dur
  const lukk = touch.aktiv && (dragY.value > 120 || (dragY.value > 40 && fart > 0.6))
  touch = null
  dragging.value = false
  if (lukk) emit('close')
  dragY.value = 0
}

const sheetStyle = computed(() => (dragY.value ? { transform: `translateY(${dragY.value}px)` } : null))

function checkMobile() {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches
}

function onKey(e) {
  if (e.key === 'Escape' && props.show) emit('close')
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  document.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  document.removeEventListener('keydown', onKey)
})

const transitionName = computed(() => isMobile.value ? 'ds-sheet-mobile' : 'ds-sheet-desktop')

watch(() => props.show, (val) => {
  dragY.value = 0
  dragging.value = false
  touch = null
  if (val) {
    nextTick(() => {
      const el = bodyRef.value?.querySelector('input, textarea, select')
      el?.focus()
    })
  }
})
</script>

<template>
  <!-- Teleport: position:fixed brytes av transform på forfedre (f.eks. ds-anim-fade-up),
       så sheeten må alltid rendres rett på body. -->
  <Teleport to="body">
  <Transition :name="transitionName">
    <div v-if="show" class="ds-overlay ds-sheet-overlay" @click.self="emit('close')">
      <div
        class="ds-sheet"
        :class="{ 'ds-sheet--media': !!$slots.media, 'ds-sheet--dragging': dragging }"
        :style="sheetStyle"
        role="dialog"
        aria-modal="true"
        @touchstart.passive="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <!-- Med media (video på toppen) scroller hele arket som ett stykke:
             filmen, tittelen og kroppen. Lukk-krysset ligger utenfor
             scrolleren, festet i hjørnet, så det står der også når filmen har
             scrollet ut av bildet. -->
        <button v-if="$slots.media" type="button" class="ds-sheet__close ds-sheet__close--float" @click="emit('close')" aria-label="Lukk">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div ref="scrollRef" :class="$slots.media ? 'ds-sheet__scroll' : 'ds-sheet__stack'">
          <div v-if="$slots.media" class="ds-sheet__media">
            <slot name="media" />
          </div>
          <div v-if="title" class="ds-sheet__header" :class="{ 'ds-sheet__header--media': !!$slots.media }">
            <h3 class="ds-sheet__title">{{ title }}</h3>
            <button v-if="!$slots.media" type="button" class="ds-sheet__close" @click="emit('close')" aria-label="Lukk">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div ref="bodyRef" class="ds-sheet__body">
            <slot />
          </div>
        </div>
      </div>
    </div>
  </Transition>
  </Teleport>
</template>
