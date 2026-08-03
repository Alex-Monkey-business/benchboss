<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' }
})

const emit = defineEmits(['close'])

const isMobile = ref(false)
const bodyRef = ref(null)

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
      <div class="ds-sheet" role="dialog" aria-modal="true">
        <div v-if="title" class="ds-sheet__header">
          <h3 class="ds-sheet__title">{{ title }}</h3>
          <button type="button" class="ds-sheet__close" @click="emit('close')" aria-label="Lukk">
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
  </Transition>
  </Teleport>
</template>
