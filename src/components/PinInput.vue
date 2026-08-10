<script setup>
import { ref, nextTick } from 'vue'

const props = defineProps({
  error: { type: Boolean, default: false },
  // 4 = PIN (dagens bruk), 6 = engangskode fra e-post.
  length: { type: Number, default: 4 },
  // 'one-time-code' lar iOS/Android tilby koden fra SMS/e-post over tastaturet.
  autocomplete: { type: String, default: 'off' }
})

const emit = defineEmits(['complete'])

const digits = ref(Array(props.length).fill(''))
const inputs = ref([])

function onInput(index, event) {
  const val = event.target.value.replace(/\D/g, '')
  digits.value[index] = val.slice(-1)
  event.target.value = digits.value[index]

  if (val && index < props.length - 1) {
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
  const text = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, props.length)
  if (text.length === props.length) {
    event.preventDefault()
    text.split('').forEach((d, i) => { digits.value[i] = d })
    nextTick(() => {
      inputs.value[props.length - 1]?.focus()
      emit('complete', text)
    })
  }
}

function clear() {
  digits.value = Array(props.length).fill('')
  nextTick(() => inputs.value[0]?.focus())
}

defineExpose({ clear })
</script>

<template>
  <div class="pin-container">
    <input
      v-for="(_, i) in length"
      :key="i"
      :ref="el => inputs[i] = el"
      type="tel"
      inputmode="numeric"
      maxlength="1"
      :autocomplete="i === 0 ? autocomplete : 'off'"
      :aria-label="`Siffer ${i + 1} av ${length}`"
      :class="['pin-digit', { 'pin-digit--error': error }]"
      :value="digits[i]"
      @input="onInput(i, $event)"
      @keydown="onKeydown(i, $event)"
      @paste="onPaste"
    />
  </div>
</template>
