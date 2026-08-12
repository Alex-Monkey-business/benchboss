import { reactive } from 'vue'

const state = reactive({
  toasts: []
})

let nextId = 0

export function useToast() {
  // duration = 0 gir en varsling som blir stående. Brukes der beskjeden er
  // viktigere enn flyten — en utløpt sesjon midt i en kamp skal ikke rekke å
  // forsvinne mens telefonen ligger i lomma.
  function show(message, type = 'success', duration = 3000) {
    const id = nextId++
    state.toasts.push({ id, message, type })
    if (duration <= 0) return
    setTimeout(() => {
      const idx = state.toasts.findIndex(t => t.id === id)
      if (idx > -1) state.toasts.splice(idx, 1)
    }, duration)
  }

  return { toasts: state.toasts, show }
}
