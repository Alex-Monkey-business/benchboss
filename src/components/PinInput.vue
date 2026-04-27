<script setup>
import { ref, nextTick } from 'vue'

const props = defineProps({
  error: { type: Boolean, default: false }
})

const emit = defineEmits(['complete'])

const digits = ref(['', '', '', ''])
const inputs = ref([])

function onInput(index, event) {
  const val = event.target.value.replace(/\D/g, '')
  digits.value[index] = val.slice(-1)
  event.target.value = digits.value[index]

  if (val && index < 3) {
    nextTick(() => inputs.value[index + 1]?.focus())
  }

  if (digits.value.every(d => d !== '')) {
    emit('complete', digits.value.join(''))
  }
}

function onKeydown(index, event) {
  if (event.key === 'Backspace' && !digits.value[index] && index > 0) {
    digits.value[index - 1] = ''
    nextTick(() => inputs.value[index - 1]?.focus())
  }
}

function onPaste(event) {
  const text = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 4)
  if (text.length === 4) {
    event.preventDefault()
    text.split('').forEach((d, i) => { digits.value[i] = d })
    nextTick(() => {
      inputs.value[3]?.focus()
      emit('complete', text)
    })
  }
}

function clear() {
  digits.value = ['', '', '', '']
  nextTick(() => inputs.value[0]?.focus())
}

defineExpose({ clear })
</script>

<template>
  <div class="pin-container">
    <input
      v-for="(_, i) in 4"
      :key="i"
      :ref="el => inputs[i] = el"
      type="tel"
      inputmode="numeric"
      maxlength="1"
      autocomplete="off"
      :class="['pin-digit', { 'pin-digit--error': error }]"
      :value="digits[i]"
      @input="onInput(i, $event)"
      @keydown="onKeydown(i, $event)"
      @paste="onPaste"
    />
  </div>
</template>
