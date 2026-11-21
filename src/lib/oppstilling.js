// Laget på banen: appen plasserer selv, treneren justerer (Alex, 21. nov).
//
// Plasseringen er en ren tilordning: hver plass i formasjonen får den
// spilleren som passer best, regnet for hele laget på én gang (ungarsk
// metode), ikke plass for plass. Plass for plass ville gitt den første
// plassen den beste spilleren selv om hen var den eneste som kunne stå i mål.
//
// Justeringene ligger oppå: `laste` er plassene treneren har bestemt
// ({ slotId: spillerId }). De gjelder så lenge spilleren er på laget. Resten
// av plassene fylles automatisk med resten av spillerne.

import { positionCost, positionForSlot } from './playerPositions.js'

// Minste totale kostnad for en n×m-matrise med n ≤ m. Returnerer for hver rad
// kolonnen den fikk. Klassisk O(n²m), holder i massevis for et lag.
function ungarsk(kost) {
  const n = kost.length
  const m = kost[0]?.length || 0
  if (!n || !m) return []
  const INF = 1e9
  const u = new Array(n + 1).fill(0)
  const v = new Array(m + 1).fill(0)
  const p = new Array(m + 1).fill(0)
  const way = new Array(m + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array(m + 1).fill(INF)
    const brukt = new Array(m + 1).fill(false)
    do {
      brukt[j0] = true
      const i0 = p[j0]
      let delta = INF
      let j1 = 0
      for (let j = 1; j <= m; j++) {
        if (brukt[j]) continue
        const cur = kost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0 }
        if (minv[j] < delta) { delta = minv[j]; j1 = j }
      }
      for (let j = 0; j <= m; j++) {
        if (brukt[j]) { u[p[j]] += delta; v[j] -= delta } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }
  const ut = new Array(n).fill(-1)
  for (let j = 1; j <= m; j++) if (p[j]) ut[p[j] - 1] = j - 1
  return ut
}

// formasjon: [{ id, role, x, y }], spillere: [{ id, name, positions }],
// laste: { slotId: spillerId }, spillform: 3|5|7|9|11.
// Returnerer { plasser: { slotId: spillerId }, benk: [spillerId], auto: Set(slotId) }.
export function plasserLag(formasjon, spillere, laste = {}, spillform = 7) {
  const pa = new Set(spillere.map(s => s.id))
  const plasser = {}
  const opptatt = new Set()
  for (const slot of formasjon) {
    const id = laste?.[slot.id]
    if (id && pa.has(id) && !opptatt.has(id)) { plasser[slot.id] = id; opptatt.add(id) }
  }
  // Har treneren bestemt hele laget (alle plassene låst), står resten på
  // benken. Ellers fylles de ledige plassene av de som er igjen.
  const ledige = formasjon.filter(s => !plasser[s.id])
  // Navnerekkefølge først, så like gode valg blir like på hver telefon.
  const igjen = spillere.filter(s => !opptatt.has(s.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'no') || (a.id < b.id ? -1 : 1))
  const auto = new Set()
  if (ledige.length && igjen.length) {
    // Rader må være ≤ kolonner: er det færre spillere enn plasser, fylles
    // de plassene som betyr mest (keeper først, så bakfra og fram).
    const viktigst = [...ledige].sort((a, b) => (a.role === 'keeper' ? -1 : 0) - (b.role === 'keeper' ? -1 : 0) || b.y - a.y)
    const rader = viktigst.slice(0, Math.min(viktigst.length, igjen.length))
    const kost = rader.map(slot => igjen.map(s => positionCost(s, positionForSlot(slot.id, spillform))))
    ungarsk(kost).forEach((j, i) => {
      if (j < 0) return
      plasser[rader[i].id] = igjen[j].id
      auto.add(rader[i].id)
    })
  }
  const pabanen = new Set(Object.values(plasser))
  const benk = igjen.filter(s => !pabanen.has(s.id)).map(s => s.id)
  return { plasser, benk, auto }
}

// Treneren bytter to: to på banen bytter plass, eller en fra benken går inn
// på plassen til en på banen. Returnerer de nye låste plassene — hele laget
// slik det står etter byttet, så ingenting flytter seg etterpå.
// a og b: { slot } eller { benk: spillerId }.
export function bytt(plasser, a, b) {
  const ny = { ...plasser }
  if (a.slot && b.slot) {
    const x = ny[a.slot]
    ny[a.slot] = ny[b.slot]
    ny[b.slot] = x
    if (!ny[a.slot]) delete ny[a.slot]
    if (!ny[b.slot]) delete ny[b.slot]
    return ny
  }
  const slot = a.slot || b.slot
  const inn = a.benk || b.benk
  if (!slot || !inn) return ny
  ny[slot] = inn
  return ny
}
