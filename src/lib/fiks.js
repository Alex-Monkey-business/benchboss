// FIKS-import: lag og terminliste hentet rett fra fotball.no.
//
// To offentlige endepunkter, begge med Access-Control-Allow-Origin: *, så
// nettleseren kan hente dem selv. Ingen proxy, ingen nøkkel, ingen backend.
//
//   Klubbsøk       POST /SearchPage/Search   (skjemakodet: q=<navn>)
//   Klubbens lag   /fotballdata/klubb/hjem/?fiksId=<klubb>&underside=lag
//   Terminliste    /footballapi/Calendar/GetCalendar?teamId=<lag>
//
// Søket er hovedveien: ett kall gir klubben OG alle lagene dens, 184 kB mot
// 745 kB for klubbsida. Lag-sida er reserven når søket ikke finner klubben.
//
// Alt her er rene funksjoner uten avhengigheter. iCal-en parses for hånd —
// et bibliotek for formatet koster mer enn de førti linjene det tar, og vi
// har nettopp brukt en commit på å få 142 kB ut av hjemskjermen.

export const FIKS_BASE = 'https://www.fotball.no'

// ---------------------------------------------------------------- Årgang

// Årskull → aldersklasse. FIKS bruker alderen spillerne fyller i sesongen:
// født 2015 er G11 i 2026. Klassene stopper på 19; over det er det senior.
export function ageClass(birthYear, year = new Date().getFullYear()) {
  const y = parseInt(birthYear, 10)
  if (!y) return null
  const age = year - y
  if (age < 5 || age > 19) return null
  return age
}

// ------------------------------------------------------------- Klubbsøk

// Skjemakodet POST — en av de tre innholdstypene nettleseren sender uten
// preflight, så søket går rett fra klienten uten CORS-runde.
export const CLUB_SEARCH_URL = `${FIKS_BASE}/SearchPage/Search`

export function clubSearchBody(query) {
  return new URLSearchParams({ q: String(query || '').trim() })
}

const CLUB_BLOCK = '<div class="clubSearchResult">'
const CLUB_ID = /\/fotballdata\/klubb\/hjem\/\?fiksId=(\d+)/
const CLUB_NAME = /class="clubName"[^>]*>([^<]+)</
const CLUB_DISTRICT = /class="clubDistrict"[^>]*>([^<]+)</
const TEAM_IN_BLOCK = /class="teamLink" href="\/fotballdata\/lag\/hjem\/\?fiksId=(\d+)"[\s\S]{0,400}?iconButtonTitle">([^<]*)<\/div>/g

export { clubLogo } from './klubblogo.js'

export function parseClubSearch(html) {
  const out = []
  for (const block of String(html || '').split(CLUB_BLOCK).slice(1)) {
    const id = CLUB_ID.exec(block)
    if (!id) continue
    const teams = []
    const seen = new Set()
    let t
    TEAM_IN_BLOCK.lastIndex = 0
    while ((t = TEAM_IN_BLOCK.exec(block))) {
      const navn = stripTags(t[2])
      if (navn && !seen.has(t[1])) { seen.add(t[1]); teams.push({ fiksId: t[1], name: navn }) }
    }
    const name = CLUB_NAME.exec(block)
    const district = CLUB_DISTRICT.exec(block)
    out.push({
      fiksId: id[1],
      // Logoens alt-tekst sier «ukjent klubbnavn» for klubber uten logo —
      // navnet står i clubName-lenka, ikke i bildet.
      name: name ? stripTags(name[1]) : `Klubb ${id[1]}`,
      // Kretsen skiller Halsen IF fra Halsnøy IL i en treffliste.
      district: district ? stripTags(district[1]) : null,
      teams: teams.sort((a, b) => a.name.localeCompare(b.name, 'no'))
    })
  }
  return out
}

// Et treff uten lag er en klubb uten aktive lag i FIKS — ingenting å hente.
export function usableClub(c) {
  return !!c && c.teams.length > 0
}

// ------------------------------------------------------- Klubbens lag

// Lag-lista er serverrendret HTML. Vi leter etter lenkene til lagsidene og
// tar teksten i dem — ingen DOMParser, for sida er 745 kB og vi trenger
// førti anker-tagger av den.
const TEAM_LINK = /<a[^>]*href="\/fotballdata\/lag\/hjem\/\?fiksId=(\d+)"[^>]*>([\s\S]*?)<\/a>/g

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

// Sida koder ø som &#xF8; og æ som &#xE6;. Uten tallreferansene heter laget
// «Gr&#xF8;nn» hele veien inn i basen.
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseClubTeams(html) {
  const seen = new Map()
  let m
  TEAM_LINK.lastIndex = 0
  while ((m = TEAM_LINK.exec(html))) {
    const name = stripTags(m[2])
    if (name && !seen.has(m[1])) seen.set(m[1], { fiksId: m[1], name })
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'no'))
}

// «Halsen G11 Grønn» hører til alder 11. Senior- og bokstavløse lag faller ut.
const AGE_IN_NAME = /\b([GJ])(\d{1,2})\b/

export function teamAge(name) {
  const m = AGE_IN_NAME.exec(name || '')
  return m ? { gender: m[1], age: parseInt(m[2], 10) } : null
}

// «Stag G2018» → 'G'. Aldersklassen alene skiller ikke gutter fra jenter:
// et søk på 8-åringer i Stag gir både G8 og J8, og bare det ene settet er
// dette kullets lag.
export function genderFromCohortName(name) {
  const m = /\b([GJ])\s?(?:\d{2}|\d{4})\b/.exec(String(name || ''))
  if (m) return m[1]
  if (/\bjente|\bgirls\b/i.test(name || '')) return 'J'
  if (/\bgutte|\bboys\b/i.test(name || '')) return 'G'
  return null
}

export function teamsForAge(teams, age) {
  if (!age) return []
  return teams.filter(t => teamAge(t.name)?.age === age)
}

// «Halsen G11 Grønn» → «Grønn». «Halsen G13-1» → «G13-1». Klubbnavn og
// aldersklasse er støy inne i et kull som allerede er Halsen G2015.
export function shortTeamName(name, clubShortName = '') {
  const s = String(name || '').trim()

  // Alt ETTER aldersklassen er lagets egen del av navnet: «Ørn Horten G10
  // Brun» → «Brun». Å klippe bort klubbnavnet forfra holdt ikke — kortnavnet
  // er «Ørn» mens klubben heter «Ørn Horten», så «Horten» ble stående og
  // laget het «Horten Brun».
  const m = AGE_IN_NAME.exec(s)
  if (m) {
    const etter = s.slice(m.index + m[0].length).trim()
    // «Halsen G13-1» gir «-1» — en bindestrek er ikke et lagnavn. Da er
    // klassen selv navnet: «G13-1».
    if (etter && /^[\p{L}\d]/u.test(etter)) return etter
    return s.slice(m.index).trim()
  }

  if (clubShortName) {
    const esc = clubShortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const uten = s.replace(new RegExp(`^${esc}\\s+`, 'i'), '').trim()
    if (uten) return uten
  }
  return s
}

// ---------------------------------------------------------- Terminliste

// iCal bryter lange linjer med CRLF + ett mellomrom. Uten oppbrettingen
// blir halve beskrivelsen borte.
function unfold(ics) {
  return String(ics || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
}

function field(block, name) {
  const m = new RegExp(`^${name}(?:;[^:\\n]*)?:(.*)$`, 'm').exec(block)
  return m ? m[1].trim() : null
}

function unescapeText(s) {
  return String(s || '').replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1')
}

// «Eliteserien (runde 21)» → turnering + runde.
const ROUND = /^(.*?)\s*\(runde\s*(\d+)\)\s*$/i

// DTSTART;TZID=Europe/Oslo:20260209T183000 → lokal dato og tid, uten
// tidssone-regning: FIKS oppgir alltid norsk lokaltid, og det er det
// kampkortet viser.
//
// MEN kampen kan ha dato uten klokkeslett: `DTSTART;VALUE=DATE:20260427`.
// Det er vanlig i de yngste klassene, der tidspunktet settes senere. Da er
// tida null — ikke hele datoen. Før falt begge ut, og importen prøvde å
// lagre en kamp uten dato: «null value in column match_date».
function localDateTime(v) {
  const s = String(v || '')
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(s)
  if (!m) return { date: null, time: null }
  const [, y, mo, d, h, mi] = m
  return { date: `${y}-${mo}-${d}`, time: h ? `${h}:${mi}` : null }
}

// UID er en ny tilfeldig GUID for hvert kall — verifisert: 0 av 23 like
// mellom to hentinger. Nøkkelen er fiksId i kamplenka, som ligger fast.
const MATCH_ID = /fiksId=(\d+)/

export function parseTerminliste(ics) {
  const blocks = unfold(ics).split('BEGIN:VEVENT').slice(1)
  const out = []
  for (const b of blocks) {
    const url = field(b, 'URL') || ''
    const id = MATCH_ID.exec(url)
    // FIKS skriver «Stag  G9 Grønn» med dobbelt mellomrom. Navnet brukes både
    // til visning og til å kjenne igjen våre egne lag — begge deler blir
    // bedre av å klemme mellomrommene sammen.
    const summary = unescapeText(field(b, 'SUMMARY') || '')
    const [home, away] = summary.split(' - ').map(s => s.replace(/\s+/g, ' ').trim())
    if (!id || !home || !away) continue

    const desc = unescapeText(field(b, 'DESCRIPTION') || '')
    const heading = desc.split('\n')[0] || ''
    const r = ROUND.exec(heading)

    const nar = localDateTime(field(b, 'DTSTART'))
    // Uten dato er raden ubrukelig — og `match_date` er NOT NULL i basen.
    // Bedre å hoppe over den enn å velte hele importen.
    if (!nar.date) continue

    out.push({
      fiksMatchId: id[1],
      ...nar,
      homeTeam: home,
      awayTeam: away,
      venue: unescapeText(field(b, 'LOCATION') || '') || null,
      division: (r ? r[1] : heading).trim() || null,
      round: r ? r[2] : null,
      url
    })
  }
  return out.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
}

// ------------------------------------------------------------- Differanse

// Hva har endret seg siden sist. Nøkkelen er fiksMatchId; alt annet kan
// FIKS skrive om. Kamper vi har som ikke lenger står i terminlista er
// «borte» — som regel avlyst, og verdt et varsel, ikke en stille sletting.
// ---------------------------------------------------------------- Parring
//
// Kamper som ble lastet opp fra Excel har ingen FIKS-id. Skal de kunne
// oppdatere seg selv, må de først finne seg selv igjen i terminlista.
//
// Målt på Halsen: 63 av 63 kamper parret, null flertydige. Nøkkelen kan IKKE
// være motstanderens navn alene — Nanset døpte om lagene sine fra farger til
// tall midt i sesongen, og seks kamper falt ut. Den kan heller ikke være
// divisjon+runde alene: vinterserien mangler divisjon i det som ble lastet
// opp, og rundene starter på 1 igjen om våren.
//
// Tre runder, strengeste først, og et par som er satt gjenbrukes ikke.
const PARRINGER = [
  // Innen ETT av våre lag er divisjon + runde unikt.
  (f, l) => l.division && String(f.round) === String(l.round) && likt(f.division, l.division),
  // Rader uten divisjon: datoen er der, og to av våre kamper spilles ikke
  // samme dag med samme lag.
  (f, l) => f.date === l.match_date,
  // Sist: motstanderen. Svakest, fordi det er navnet som endrer seg.
  (f, l) => String(f.round) === String(l.round) &&
    (likt(f.homeTeam, l.home_team) || likt(f.awayTeam, l.away_team)),
]

function likt(a, b) {
  return reduser(a) === reduser(b)
}

// «Halsen G11 Hvit» og «Halsen Hvit» er samme lag. Aldersklassen er støy,
// det samme er store bokstaver og tegn.
function reduser(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b[gj]\d{1,2}\b/g, ' ')
    .replace(/[^a-zà-ÿ0-9]+/g, ' ')
    .trim()
}

/**
 * Parer kamper i basen med kamper fra fotball.no.
 *
 * `lagAv` sier hvilket av våre lag en kamp hører til — samme funksjon på
 * begge sider, ellers parer vi Grønn sine kamper med Rød sine.
 */
export function parKamper(lokale, hentet, lagAv) {
  const par = []
  const brukt = new Set()
  const igjen = lokale.filter(m => !m.fiks_match_id)

  for (const regel of PARRINGER) {
    for (const l of igjen) {
      if (par.some(p => p.id === l.id)) continue
      const lag = lagAv(l)
      if (!lag) continue
      const treff = hentet.filter(f =>
        !brukt.has(f.fiksMatchId) && lagAv(f) === lag && regel(f, l)
      )
      if (treff.length !== 1) continue
      par.push({ id: l.id, fiks: treff[0] })
      brukt.add(treff[0].fiksMatchId)
    }
  }

  return {
    par,
    uparede: igjen.filter(l => !par.some(p => p.id === l.id)),
    ukjente: hentet.filter(f => !brukt.has(f.fiksMatchId)),
  }
}

export function diffTerminliste(existing, fetched) {
  const before = new Map(existing.filter(m => m.fiks_match_id).map(m => [String(m.fiks_match_id), m]))
  const after = new Map(fetched.map(m => [m.fiksMatchId, m]))

  const nye = fetched.filter(m => !before.has(m.fiksMatchId))
  const endret = []
  for (const [id, m] of after) {
    const old = before.get(id)
    if (!old) continue
    const felt = []
    if (old.match_date !== m.date) felt.push('dato')
    if ((old.match_time || '').slice(0, 5) !== m.time) felt.push('tid')
    if ((old.venue || null) !== m.venue) felt.push('bane')
    if (felt.length) endret.push({ ...m, id: old.id, felt, fra: old })
  }
  const borte = [...before.values()].filter(m => !after.has(String(m.fiks_match_id)))

  return { nye, endret, borte }
}
