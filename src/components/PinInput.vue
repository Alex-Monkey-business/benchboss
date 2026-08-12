<script setup>
import { ref, nextTick } from 'vue'

const props = defineProps({
  error: { type: Boolean, default: false },
  // 4 = PIN (dagens bruk), 6 = engangskode fra e-post.
  length: { type: Number, default: 4 },
  // 'one-time-code' lar iOS tilby koden fra Meldinger/Mail over tastaturet.
  autocomplete: { type: String, default: 'off' }
})

const emit = defineEmits(['complete'])

const digits = ref(Array(props.length).fill(''))
const inputs = ref([])

// Merk: boksene har IKKE maxlength="1".
//
// Med maxlength kutter nettleseren en innlimt streng til ett tegn før
// input-hendelsen når hit — og autofyll og «lim inn» på Android sender hele
// koden inn i én boks UTEN å fyre en paste-hendelse. Resultatet var at fem av
// seks siffer forsvant sporløst. Lengden håndheves her i stedet.

function syncDom() {
  inputs.value.forEach((el, i) => {
    if (el) el.value = digits.value[i] || ''
  })
}

function emitIfComplete() {
  if (digits.value.every(d => d !== '')) {
    emit('complete', digits.value.join(''))
  }
}

// Fyller fra og med `start`. Brukes både av paste og av autofyll som lander
// som én lang verdi i én boks.
function fill(text, start = 0) {
  const chars = text.slice(0, props.length - start).split('')
  chars.forEach((d, i) => { digits.value[start + i] = d })

  nextTick(() => {
    syncDom()
    const last = Math.min(start + chars.length, props.length) - 1
    inputs.value[last]?.focus()
    emitIfComplete()
  })
}

function onInput(index, event) {
  const raw = event.target.value.replace(/\D/g, '')

  if (raw.length > 1) {
    // Kommer hele koden på én gang, hører den hjemme fra første boks — også
    // når autofyll tilfeldigvis traff en boks lenger ute. Er den kortere,
    // fortsetter vi der markøren står.
    fill(raw, raw.length >= props.length ? 0 : index)
    return
  }

  digits.value[index] = raw
  event.target.value = raw

  if (raw && index < props.length - 1) {
    nextTick(() => inputs.value[index + 1]?.focus())
  }

  emitIfComplete()
}

function onKeydown(index, event) {
  if (event.key === 'Backspace' && !digits.value[index] && index > 0) {
    digits.value[index - 1] = ''
    nextTick(() => {
      syncDom()
      inputs.value[index - 1]?.focus()
    })
  }
}

function onPaste(event) {
  const text = (event.clipboardData?.getData('text') || '').replace(/\D/g, '')
  if (!text) return
  event.preventDefault()
  // Alltid fra første boks: limer man inn en kode, er det hele koden — også
  // når markøren tilfeldigvis står i boks tre. Kortere enn full lengde fylles
  // så langt det rekker i stedet for å bli forkastet.
  fill(text, 0)
}

function clear() {
  digits.value = Array(props.length).fill('')
  nextTick(() => {
    syncDom()
    inputs.value[0]?.focus()
  })
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
