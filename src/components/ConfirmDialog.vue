<script setup>
import { watch, onUnmounted, useId } from 'vue'
import { laasScroll, slippScroll } from '../lib/scrollLock'
import { registrerLag } from '../lib/tilbake'

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: 'Bekreft' },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Bekreft' },
  cancelLabel: { type: String, default: 'Avbryt' },
  variant: { type: String, default: 'warning' }
})

const emit = defineEmits(['confirm', 'cancel'])
const tittelId = useId()
const tekstId = useId()

// Siden bak står stille mens dialogen er åpen (se scrollLock).
let laast = false
function settLaas(apen) {
  if (apen && !laast) { laasScroll(); laast = true }
  if (!apen && laast) { slippScroll(); laast = false }
}
watch(() => props.show, settLaas, { immediate: true })

// Tilbake-knappen avbryter dialogen (se tilbake.js).
let fjernLag = null
watch(() => props.show, apen => {
  if (apen && !fjernLag) fjernLag = registrerLag(() => emit('cancel'))
  if (!apen && fjernLag) { fjernLag(); fjernLag = null }
}, { immediate: true })

onUnmounted(() => {
  settLaas(false)
  if (fjernLag) { fjernLag({ viaNavigasjon: true }); fjernLag = null }
})
</script>

<template>
  <!-- Teleport: samme grunn som Sheet — fixed-overlay må ligge på body, og
       dialogen må stacke OVER en eventuell åpen (teleportert) sheet. -->
  <Teleport to="body">
  <Transition name="ds-dialog">
    <div v-if="show" class="ds-overlay" @click.self="emit('cancel')">
      <div class="ds-dialog ds-dialog--narrow" role="alertdialog" aria-modal="true" :aria-labelledby="tittelId" :aria-describedby="message ? tekstId : undefined">
        <h3 :id="tittelId" class="ds-dialog__title ds-text-center">{{ title }}</h3>
        <div class="ds-dialog__body ds-text-center" style="margin-top: 8px;">
          <p :id="tekstId">{{ message }}</p>
        </div>
        <div class="ds-dialog__footer" style="justify-content: center;">
          <button class="ds-btn ds-btn--secondary" @click="emit('cancel')">{{ cancelLabel }}</button>
          <button class="ds-btn ds-btn--primary" @click="emit('confirm')">{{ confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Transition>
  </Teleport>
</template>
