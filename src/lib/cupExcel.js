import * as XLSX from 'xlsx'
import { normalizeColumnName, parseDate, parseTime } from './excelParser.js'
import { slugify } from './playerList.js'

// Kampoppsett fra en cup-arrangør, som regnearket det pleier å være.
//
// Cuper står ikke i FIKS. Arrangøren sender et regneark eller en PDF, og fram
// til nå måtte hver kamp skrives inn for hånd — seks til tolv i en helg, ganger
// to lag. Serien har hatt Excel-import hele tiden; dette er den samme jobben.
//
// Forskjellen fra serieimporten er hvem som er OSS. Serien vet det: laget
// heter «Halsen Rød» og står i kullet. Arrangøren skriver hva som helst —
// «Halsen IF 2», «Halsen G6 Blå», «Halsen Blå». Derfor gjetter vi, og VISER
// gjettet: en stille feilkobling her er tolv kamper på feil lag.

const KOLONNER = {
  // Dato og tid
  'dato': 'match_date', 'date': 'match_date', 'kampdato': 'match_date', 'dag': 'match_date',
  'tid': 'match_time', 'kl': 'match_time', 'kl.': 'match_time', 'klokka': 'match_time',
  'klokkeslett': 'match_time', 'starttid': 'match_time', 'time': 'match_time',
  // Bane
  'bane': 'pitch', 'baner': 'pitch', 'sted': 'pitch', 'arena': 'pitch',
  'venue': 'pitch', 'pitch': 'pitch', 'field': 'pitch',
  // Kampnummer / runde
  'kampnr': 'round', 'kampnr.': 'round', 'kampnummer': 'round', 'kamp nr': 'round',
  'kamp': 'round', 'nr': 'round', 'runde': 'round', 'pulje': 'round', 'gruppe': 'round',
  // Lagene. Arrangører bruker både hjemme/borte og lag 1/lag 2.
  'hjemmelag': 'home_team', 'hjemme': 'home_team', 'hjem': 'home_team', 'home': 'home_team',
  'lag 1': 'home_team', 'lag1': 'home_team', 'lag': 'home_team',
  'bortelag': 'away_team', 'borte': 'away_team', 'away': 'away_team',
  'lag 2': 'away_team', 'lag2': 'away_team', 'motstander': 'away_team', 'mot': 'away_team'
}

// Selve parsingen tar en ArrayBuffer og ingenting annet. FileReader er
// nettleserens, og en parser som krever den kan ikke testes uten en.
export function parseCupRows(buffer) {
  const bok = XLSX.read(buffer, { type: 'array', cellDates: false })
  const ark = bok.Sheets[bok.SheetNames[0]]
  const rader = XLSX.utils.sheet_to_json(ark, { raw: true })
  if (!rader.length) return []

  // Kolonnenavnene leses av ALLE radene, ikke bare den første: et regneark med
  // en tom celle i overskriftsraden gir `__EMPTY` som nøkkel der, og da
  // forsvant kolonnen.
  const nøkler = [...new Set(rader.flatMap(r => Object.keys(r)))]
  const kart = {}
  for (const n of nøkler) {
    const felt = KOLONNER[normalizeColumnName(n)]
    // Første kolonne som mapper til et felt vinner. «Dato» og «Kampdato» i
    // samme ark skal ikke overskrive hverandre.
    if (felt && !Object.values(kart).includes(felt)) kart[n] = felt
  }

  return rader
    .map(rad => {
      const ut = {}
      for (const [fra, til] of Object.entries(kart)) ut[til] = rad[fra]
      return {
        match_date: parseDate(ut.match_date),
        match_time: parseTime(ut.match_time),
        pitch: ut.pitch ? String(ut.pitch).trim() : null,
        round: ut.round != null && ut.round !== '' ? String(ut.round).trim() : null,
        home_team: String(ut.home_team || '').trim(),
        away_team: String(ut.away_team || '').trim()
      }
    })
    // Uten to lag er raden ikke en kamp — den er en overskrift, en tom rad
    // eller en fotnote.
    .filter(r => r.home_team && r.away_team)
    // Uten dato kan kampen hverken sorteres eller vises.
    .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.match_date || ''))
}

export function parseCupMatchFile(file) {
  return new Promise((resolve, reject) => {
    const leser = new FileReader()
    leser.onerror = () => reject(new Error('Kunne ikke lese filen'))
    leser.onload = e => {
      try { resolve(parseCupRows(e.target.result)) } catch (err) { reject(err) }
    }
    leser.readAsArrayBuffer(file)
  })
}

// Er dette laget vårt? Arrangørens skrivemåte trenger ikke å ligne på vår.
//
// Vi kjenner to ting: klubbens kortnavn («Halsen») og lagene vi meldte på
// («Blå», «Rød»). Et treff på lagnavnet er sterkere enn på klubben — «Halsen
// Blå» mot «Halsen Rød» skiller seg bare på lagdelen.
function poeng(navn, klubb, lag) {
  const n = ` ${slugify(navn).replace(/-/g, ' ')} `
  const har = ord => ord && n.includes(` ${slugify(ord).replace(/-/g, ' ')} `)
  if (har(lag.name)) return 2
  if (klubb && har(klubb)) return 1
  return 0
}

/**
 * Fordeler radene på våre cup-lag.
 *
 * Returnerer én rad per kamp med `our_team`, `opponent` og `sikker`. `sikker`
 * er hele poenget: er den false, har vi gjettet, og brukeren må se raden før
 * den lagres. Ingenting importeres stille på feil lag.
 */
export function fordelLag(rader, { klubbKortnavn = '', cupLag = [] } = {}) {
  return rader.map(r => {
    let beste = null
    for (const side of ['home_team', 'away_team']) {
      for (const lag of cupLag) {
        const p = poeng(r[side], klubbKortnavn, lag)
        if (p > 0 && (!beste || p > beste.p)) beste = { p, side, lag }
      }
    }

    const side = beste?.side || 'home_team'
    const motsatt = side === 'home_team' ? 'away_team' : 'home_team'
    return {
      match_date: r.match_date,
      match_time: r.match_time,
      pitch: r.pitch,
      round: r.round,
      our_team: beste?.lag.slug || cupLag[0]?.slug || null,
      opponent: r[motsatt],
      // Kun et treff på LAGNAVNET er sikkert. Et klubbtreff alene sier at
      // kampen er vår, men ikke hvilket av lagene våre den tilhører.
      sikker: beste?.p === 2,
      raw: `${r.home_team} – ${r.away_team}`
    }
  })
}
