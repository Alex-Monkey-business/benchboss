// Bruk av spillere mellom lag, 13–19 år (Breddereglementet § 2-12, fra 2026).
//
// Et lag kan bruke et begrenset antall spillere som var med i siste
// obligatoriske kamp til nærmeste HØYERE rangerte lag i samme spillform:
// 6 i 11er, 5 i 9er, 4 i 7er (summert over de andre 7er-lagene), 3 i 5er.
// Fra et lavere rangert lag er det fritt. Likestilte lag (samme nivå) er
// begrenset begge veier.
//
// Alt her er utledet av data som allerede finnes: divisjonen i FIKS gir
// rangen, troppen på forrige kamp gir hvem som var med. Treneren skriver
// ingenting inn. «Med» betyr i kamptroppen, ikke bare de som fikk minutter:
// det er den strenge lesningen, og kretsen har ikke sagt noe annet.

export const FRA_ALDER = 13
export const GRENSE = { 11: 6, 9: 5, 7: 4, 5: 3 }

// Serie, kvalik og Interkrets teller. Cup (Jotron Cup m.fl.) og treningskamper
// gjør ikke, og en kamp uten divisjon er som regel en treningskamp lagt inn
// for hånd.
export function erObligatorisk(match) {
  const d = String(match?.division || '').trim()
  if (!d) return false
  return !/\bcup\b|trenings|privat|vennskap/i.test(d)
}

// Divisjon → nivå, lavest er best. Interkrets over 1. divisjon over 2. osv.
// Null når teksten ikke sier noe om nivå («G15 vår avd C2»).
export function nivaFraDivisjon(division) {
  const d = String(division || '').toLowerCase()
  if (!d) return null
  if (/interkrets|elite/.test(d)) return 0
  const m = /(\d)\.\s?div/.exec(d)
  return m ? Number(m[1]) : null
}

// «Halsen G15-1» → 1. Siste utvei når divisjonen ikke sier noe.
function nummerINavn(t) {
  const m = /-(\d+)\s*$/.exec(String(t?.fiks_name || t?.name || '').trim())
  return m ? Number(m[1]) : null
}

// Vår og høst er hver sin runde: vårens siste kamp teller ikke om høsten.
function halvar(dato) {
  return Number(String(dato).slice(5, 7)) <= 7 ? 'var' : 'host'
}

function tidspunkt(m) {
  const t = (m.match_time || '').slice(0, 5)
  return `${m.match_date}T${t && t !== '00:00' ? t : '12:00'}`
}

/**
 * Rang per lag: { slug: nivå }. Beste obligatoriske divisjon i sesongen
 * vinner. Mangler alle lag nivå fra divisjonen, brukes -1/-2 i navnet; ellers
 * får lag uten nivå samme nivå som det dårligste kjente (likestilt nederst).
 */
export function rangPerLag(teams, matches, lagForKamp) {
  const fraDiv = {}
  for (const m of matches || []) {
    if (!erObligatorisk(m)) continue
    const n = nivaFraDivisjon(m.division)
    if (n === null) continue
    for (const slug of lagForKamp(m)) {
      if (fraDiv[slug] === undefined || n < fraDiv[slug]) fraDiv[slug] = n
    }
  }
  const out = {}
  const kjente = Object.values(fraDiv)
  if (!kjente.length) {
    for (const t of teams) out[t.slug] = nummerINavn(t) ?? 1
    return out
  }
  const nederst = Math.max(...kjente)
  for (const t of teams) out[t.slug] = fraDiv[t.slug] ?? nederst
  return out
}

/**
 * Regner ut grensa for én kamp.
 *
 * @param match       kampen som tas ut
 * @param slug        vårt lag i kampen
 * @param ctx.teams   kullets lag
 * @param ctx.matches sesongens kamper
 * @param ctx.lagForKamp  (m) => [slug] våre lag i en kamp
 * @param ctx.troppFor    (m, slug) => Set(player_id) kamptroppen i en kamp
 * @param ctx.spillformFor (slug) => 11 | 9 | 7 | 5 | null
 * @param ctx.alder   kullets alder i kampens år
 *
 * Svarer null når regelen ikke gjelder kampen. Ellers
 * { grense, fra: [{ slug, kamp }], spillere: Set(player_id) } der spillere
 * er alle som var med i giverlagenes siste obligatoriske kamp.
 */
export function lanegrense(match, slug, ctx) {
  if (!match || !slug) return null
  if (!ctx.alder || ctx.alder < FRA_ALDER) return null
  if (!erObligatorisk(match)) return null

  const form = ctx.spillformFor(slug)
  const grense = GRENSE[form] ?? GRENSE[11]
  const rang = rangPerLag(ctx.teams, ctx.matches, ctx.lagForKamp)
  const min = rang[slug]

  const sammeForm = ctx.teams.filter(t => t.slug !== slug && ctx.spillformFor(t.slug) === form)
  let givere
  if (form === 7) {
    // 7er: summert over alle de andre 7er-lagene som ikke er lavere rangert.
    givere = sammeForm.filter(t => rang[t.slug] <= min)
  } else {
    const hoyere = sammeForm.filter(t => rang[t.slug] < min)
    const naermest = hoyere.length ? Math.max(...hoyere.map(t => rang[t.slug])) : null
    givere = sammeForm.filter(t => rang[t.slug] === min || rang[t.slug] === naermest)
  }
  if (!givere.length) return null

  const her = tidspunkt(match)
  const del = halvar(match.match_date)
  const fra = []
  const spillere = new Set()
  for (const t of givere) {
    const forrige = (ctx.matches || [])
      .filter(m => m.id !== match.id && erObligatorisk(m) && halvar(m.match_date) === del
        && tidspunkt(m) < her && ctx.lagForKamp(m).includes(t.slug))
      .sort((a, b) => tidspunkt(b).localeCompare(tidspunkt(a)))[0]
    if (!forrige) continue
    fra.push({ slug: t.slug, kamp: forrige })
    for (const id of ctx.troppFor(forrige, t.slug)) spillere.add(id)
  }
  if (!fra.length) return null
  return { grense, fra, spillere }
}
