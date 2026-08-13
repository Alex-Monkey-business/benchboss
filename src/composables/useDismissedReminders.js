import { ref } from 'vue'

// Skjulte påminnelser — lagret i localStorage, delt reaktivt på tvers av
// komponenter (modul-nivå ref). Nøkkel = `${kind}:${matchId}`. Kun «myke»
// påminnelser (referat/utlegg) kan skjules; tidskritiske beholdes.
const STORAGE_KEY = 'bb:dismissed-reminders'

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const dismissed = ref(new Set(load()))

function keyOf(r) {
  // Noen påminnelser handler ikke om en kamp og bærer sin egen nøkkel.
  return r.key || `${r.kind}:${r.matchId}`
}

export function useDismissedReminders() {
  function dismiss(r) {
    const next = new Set(dismissed.value)
    next.add(keyOf(r))
    dismissed.value = next
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      /* best effort — privat modus e.l. */
    }
  }

  return { dismissed, dismiss }
}
