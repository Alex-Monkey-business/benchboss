import { reactive } from 'vue'

const state = reactive({
  toasts: []
})

let nextId = 0
const timere = new Map()

export function useToast() {
  // duration = 0 gir en varsling som blir stående. Brukes der beskjeden er
  // viktigere enn flyten — en utløpt sesjon midt i en kamp skal ikke rekke å
  // forsvinne mens telefonen ligger i lomma.
  //
  // opts.action = { label, handler }: én knapp i varslinga («Angre»). Knappen
  // kjører handleren og lukker varslinga. Det er det som gjør at et bytte i
  // match mode kan gå på ett trykk uten bekreftelse — feilen koster ett trykk.
  // opts.detail: en andre linje under meldinga (kudos-varianten bruker den).
  function show(message, type = 'success', duration = 3000, opts = null) {
    // Samme beskjed som allerede står: ingen ny under den. Den som står, får
    // ny tid. Fem «Fikk ikke lagret» etter hverandre er én beskjed, ikke fem.
    const lik = !opts?.action && state.toasts.find(t => t.message === message && t.type === type && !t.action)
    if (lik) {
      clearTimeout(timere.get(lik.id))
      if (duration > 0) timere.set(lik.id, setTimeout(() => dismiss(lik.id), duration))
      return lik.id
    }
    const id = nextId++
    const toast = { id, message, type, action: null, detail: opts?.detail || '' }
    if (opts?.action) {
      const a = opts.action
      toast.action = { label: a.label, run: () => { dismiss(id); a.handler?.() } }
    }
    state.toasts.push(toast)
    if (duration > 0) timere.set(id, setTimeout(() => dismiss(id), duration))
    return id
  }

  function dismiss(id) {
    clearTimeout(timere.get(id))
    timere.delete(id)
    const idx = state.toasts.findIndex(t => t.id === id)
    if (idx > -1) state.toasts.splice(idx, 1)
  }

  return { toasts: state.toasts, show, dismiss }
}
