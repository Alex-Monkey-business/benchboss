// Parser for «Lim inn planen» — gjør en tekstet ukeplan (Messenger, notater)
// om til økter med øvelser. Heuristikk, ikke grammatikk: ukedagslinjer starter
// ny økt, kulepunkter blir øvelser, løpende tekst blir fokus/oppsett.

const WEEKDAYS = [
  { day: 1, names: ['mandag'] },
  { day: 2, names: ['tirsdag'] },
  { day: 3, names: ['onsdag'] },
  { day: 4, names: ['torsdag'] },
  { day: 5, names: ['fredag'] },
  { day: 6, names: ['lørdag', 'lordag'] },
  { day: 7, names: ['søndag', 'sondag'] }
]

const BULLET_RE = /^\s*(?:[-*•–—·]|\d+[.)])\s+/

// Rene dato-rester etter ukedagsnavnet («5. august», «05.08», «9/8») — ikke fokus.
const DATE_ONLY_RE = /^\d{1,2}[./]?\s*(?:\d{1,2}[./]?\d{0,4}|jan\w*|feb\w*|mar\w*|apr\w*|mai|jun\w*|jul\w*|aug\w*|sep\w*|okt\w*|nov\w*|des\w*)?\.?$/i

// Skjøt prosa-linjer med setningsskille når den forrige mangler tegnsetting.
function joinProse(a, b) {
  if (!a) return b
  return /[.!?…:]$/.test(a) ? `${a} ${b}` : `${a}. ${b}`
}

// «Tirsdag», «**Tirsdag**», «Tirsdag: Ferdigheter under press», «Tirsdag 5. august»
function matchWeekday(line) {
  const clean = line.replace(/^[\s*#_>]+/, '').trim()
  const lower = clean.toLowerCase()
  for (const wd of WEEKDAYS) {
    for (const name of wd.names) {
      if (lower.startsWith(name)) {
        const rest = clean.slice(name.length)
        // Ordgrense: «Tirsdagstrening» skal ikke matche som egen dag + rest.
        if (rest && /^[a-zæøå]/i.test(rest)) continue
        const title = clean.slice(0, name.length)
        let remainder = rest
          .replace(/^[\s:–—,.\-*_]+/, '')
          .replace(/[\s*_]+$/, '')
        if (DATE_ONLY_RE.test(remainder)) remainder = ''
        return { weekday: wd.day, title: title[0].toUpperCase() + title.slice(1).toLowerCase(), remainder }
      }
    }
  }
  return null
}

// Valgfri type-markør i øvelsesteksten: «(diff)» / «(mix)» hvor som helst.
function extractType(text) {
  const m = text.match(/\(\s*(diff|mix)\s*\)/i)
  if (!m) return { type: 'none', text: text.trim() }
  return {
    type: m[1].toLowerCase(),
    text: text.replace(m[0], '').replace(/\s{2,}/g, ' ').trim()
  }
}

function emptySession(title, weekday, focusSeed) {
  return {
    title,
    weekday,
    focus: focusSeed || '',
    drills: []
  }
}

/**
 * parseTreningsplan(text) → { sessions, skipped }
 * sessions: [{ title, weekday, focus, drills: [{ type, text, tema, organisering, laeringsmomenter, link }] }]
 * skipped: linjer før første ukedag (periodens intro o.l. — vises, lagres ikke)
 */
export function parseTreningsplan(text) {
  const sessions = []
  const skipped = []
  let current = null
  let currentDrill = null

  for (const raw of (text || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue

    const wd = matchWeekday(raw)
    if (wd) {
      current = emptySession(wd.title, wd.weekday, wd.remainder)
      currentDrill = null
      sessions.push(current)
      continue
    }

    if (!current) {
      skipped.push(line)
      continue
    }

    if (BULLET_RE.test(raw)) {
      const content = raw.replace(BULLET_RE, '').trim()
      if (!content) continue
      const { type, text: drillText } = extractType(content)
      currentDrill = { type, text: drillText, tema: null, organisering: null, laeringsmomenter: [], link: null }
      current.drills.push(currentDrill)
      continue
    }

    // Løpende tekst: før første øvelse → fokus; etter en øvelse → oppsett.
    if (!currentDrill) {
      current.focus = joinProse(current.focus, line)
    } else {
      currentDrill.organisering = joinProse(currentDrill.organisering, line)
    }
  }

  return { sessions, skipped }
}
