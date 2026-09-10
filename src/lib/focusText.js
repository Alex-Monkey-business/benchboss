// Fokus-teksten på en trening er skrevet som «[Kort tema]. [Detalj].»
// Temaet er det som skal stå der plassen er liten; detaljen er støtte.
// Én funksjon, så kortet på Hjem og raden i ukelista ikke kan sprike.
export function splitFocus(focus, fallback = '') {
  const f = (focus || '').trim()
  if (!f) return { lead: fallback, detail: '' }
  const m = f.match(/^(.+?[.!?])\s+(.+)$/s)
  if (m && m[1].length <= 48) return { lead: m[1], detail: m[2] }
  return { lead: f, detail: '' }
}
