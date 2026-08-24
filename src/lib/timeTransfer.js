// Flytte spilletid mellom to spillere etter at kampen er ferdig.
//
// Premisset: spilletid er et nullsumspill. Det står nøyaktig like mange på
// banen hele kampen, så minutter kan ikke oppstå eller forsvinne — bare bytte
// eier. Derfor er en justering aldri «gi Julian fem minutter»; den er alltid
// ETT bytte: A går av, B står de sekundene A ikke lenger står.
//
// Det er grunnen til at denne fila ikke validerer i etterkant. Et bytte kan
// ikke rote til antallet på banen, fordi det er nettopp det et bytte er. Får vi
// modellen riktig, finnes ikke feiltilstanden vi ellers måtte lete etter.
//
// Det som KAN gå galt er at B allerede står på banen i vinduet vi vil ta fra.
// Da er svaret ikke å presse gjennom, men å finne et annet vindu — eller si at
// det ikke går. Derfor returnerer planleggeren hvor mye den faktisk fikk flyttet.

// Ledige vinduer innenfor [lo, hi) gitt en liste opptatte intervaller.
function freeWindows(busy, lo, hi) {
  const out = []
  let cur = lo
  for (const b of [...busy].sort((a, z) => a.on - z.on)) {
    if (b.off <= cur) continue
    if (b.on >= hi) break
    if (b.on > cur) out.push([cur, Math.min(b.on, hi)])
    cur = Math.max(cur, b.off)
    if (cur >= hi) break
  }
  if (cur < hi) out.push([cur, hi])
  return out.filter(([a, z]) => z > a)
}

// Hale før hode før midten. En hale eller et hode flytter bare én grense — det
// leser som et ekte bytte. Et vindu midt i en periode må dele den i to, altså
// «av og inn igjen», som er sjeldnere i virkeligheten. Vi foretrekker den
// forklaringen som er mest sannsynlig sann.
function rank(win, stint, end) {
  if (win[1] === end) return 0
  if (win[0] === stint.on_clock) return 1
  return 2
}

export function planTransfer({ stints, fromId, toId, seconds, matchEnd }) {
  if (!fromId || !toId || fromId === toId || !(seconds > 0)) {
    return { moved: 0, ops: [], reason: 'ugyldig' }
  }

  const endOf = s => (s.off_clock == null ? matchEnd : s.off_clock)
  // Arbeidskopi. Nye perioder får midlertidig id til de faktisk er skrevet.
  let tmp = 0
  const work = stints.map(s => ({ ...s, _end: endOf(s) }))

  let remaining = seconds
  let moved = 0

  while (remaining > 0) {
    const busyTo = work
      .filter(s => s.player_id === toId)
      .map(s => ({ on: s.on_clock, off: s._end }))

    let best = null
    for (const s of work) {
      if (s.player_id !== fromId) continue
      for (const w of freeWindows(busyTo, s.on_clock, s._end)) {
        const len = Math.min(w[1] - w[0], remaining)
        if (len <= 0) continue
        const r = rank(w, s, s._end)
        // Klipp vinduet ned til det vi trenger, fra den enden som gir bytte.
        const win = r === 1 ? [w[0], w[0] + len] : [w[1] - len, w[1]]
        const cand = { stint: s, win, rank: r, len }
        if (!best || cand.rank < best.rank || (cand.rank === best.rank && cand.len > best.len)) best = cand
      }
    }
    if (!best) break

    const { stint: s, win } = best
    const [x, y] = win
    const take = y - x

    // Tar vi hele perioden, bytter den bare eier. Ingen ny rad, ingen deling.
    if (x === s.on_clock && y === s._end) {
      s.player_id = toId
    } else {
      if (y === s._end) s._end = x
      else if (x === s.on_clock) s.on_clock = y
      else {
        // Midt i: A står før og etter, B imellom.
        work.push({ id: `ny:${tmp++}`, match_id: s.match_id, player_id: fromId, role: s.role, position: s.position, on_clock: y, _end: s._end })
        s._end = x
      }
      // Har B en periode som grenser inntil, utvider vi den i stedet for å
      // lage en ny. Ellers ville flata vist to bytter der det skjedde ett.
      const before = work.find(z => z.player_id === toId && z._end === x)
      const after = work.find(z => z.player_id === toId && z.on_clock === y)
      if (before) before._end = after ? after._end : y
      if (before && after) work.splice(work.indexOf(after), 1)
      else if (after && !before) after.on_clock = x
      else if (!before && !after) {
        work.push({ id: `ny:${tmp++}`, match_id: s.match_id, player_id: toId, role: s.role, position: s.position, on_clock: x, _end: y })
      }
    }

    moved += take
    remaining -= take
  }

  // Diff mot utgangspunktet — bare det som faktisk er endret skrives.
  const before = new Map(stints.map(s => [s.id, s]))
  const ops = []
  const seen = new Set()
  for (const s of work) {
    seen.add(s.id)
    const o = before.get(s.id)
    if (!o) {
      ops.push({ kind: 'insert', row: { match_id: s.match_id, player_id: s.player_id, role: s.role, position: s.position, on_clock: s.on_clock, off_clock: s._end } })
    } else if (o.on_clock !== s.on_clock || endOf(o) !== s._end || o.player_id !== s.player_id) {
      ops.push({ kind: 'update', id: s.id, before: { player_id: o.player_id, on_clock: o.on_clock, off_clock: o.off_clock }, patch: { player_id: s.player_id, on_clock: s.on_clock, off_clock: s._end } })
    }
  }
  for (const o of stints) if (!seen.has(o.id)) ops.push({ kind: 'delete', id: o.id, before: { ...o } })

  return { moved, ops, reason: moved < seconds ? 'delvis' : null }
}

// Hvor mye som i det hele tatt lar seg flytte — brukes til å gråe ut valg
// flata ellers ville tilbudt og så feilet på.
export function transferableSeconds({ stints, fromId, toId, matchEnd }) {
  return planTransfer({ stints, fromId, toId, seconds: matchEnd, matchEnd }).moved
}
