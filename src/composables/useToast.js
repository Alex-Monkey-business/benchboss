import { reactive } from 'vue'

const state = reactive({
  toasts: []
})

let nextId = 0

export function useToast() {
  // duration = 0 gir en varsling som blir stående. Brukes der beskjeden er
  // viktigere enn flyten — en utløpt sesjon midt i en kamp skal ikke rekke å
  // forsvinne mens telefonen ligger i lomma.
  //
  // action = { label, handler }: én knapp i varslinga («Angre»). Knappen kjører
  // handleren og lukker varslinga. Det er det som gjør at et bytte i match mode
  // kan gå på ett trykk uten bekreftelse — feilen koster ett trykk tilbake.
  function show(message, type = 'success', duration = 3000, action = null) {
    const id = nextId++
    const toast = { id, message, type, action: null }
    if (action) {
      toast.action = { label: action.label, run: () => { dismiss(id); action.handler?.() } }
    }
    state.toasts.push(toast)
    if (duration > 0) setTimeout(() => dismiss(id), duration)
    return id
  }

  function dismiss(id) {
    const idx = state.toasts.findIndex(t => t.id === id)
    if (idx > -1) state.toasts.splice(idx, 1)
  }

  return { toasts: state.toasts, show, dismiss }
}
