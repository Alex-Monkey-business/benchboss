// Cup-kampoppsett fra regneark: parsing og lagfordeling.
//
// Den farlige feilen her er ikke en krasj — det er tolv kamper som havner
// stille på feil lag fordi arrangøren skrev «Halsen IF 2» og vi meldte på
// «Rød». Derfor tester denne hva som blir SIKKERT og hva som blir et gjett.
import * as XLSX from 'xlsx'
import { parseCupRows, fordelLag } from '../src/lib/cupExcel.js'

let feilet = 0
const ok = (l, c, x = '') => { if (!c) feilet++; console.log(`${c ? 'OK  ' : 'FEIL'} ${l}${x ? '  — ' + x : ''}`) }

function ark(rader) {
  const bok = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(bok, XLSX.utils.json_to_sheet(rader), 'Kamper')
  return XLSX.write(bok, { type: 'array', bookType: 'xlsx' })
}

const LAG = [{ slug: 'bla', name: 'Blå' }, { slug: 'rod', name: 'Rød' }]

// ---------- 1. Vanlig arrangør-ark ----------
let rader = parseCupRows(ark([
  { 'Kampnr': 436, 'Dato': '08.08.2026', 'Tid': '11:00', 'Bane': 'Virik 3', 'Hjemmelag': 'Halsen Blå', 'Bortelag': 'Ready Blå' },
  { 'Kampnr': 627, 'Dato': '08.08.2026', 'Tid': '12:30', 'Bane': 'Virik 5', 'Hjemmelag': 'Svene IL', 'Bortelag': 'Halsen Rød' }
]))
ok('leser begge radene', rader.length === 2, `${rader.length}`)
ok('dato blir ISO', rader[0].match_date === '2026-08-08', rader[0].match_date)
ok('tid blir HH:MM', rader[0].match_time === '11:00', rader[0].match_time)
ok('bane følger med', rader[0].pitch === 'Virik 3', rader[0].pitch)
ok('kampnummer blir runde', rader[0].round === '436', rader[0].round)

let fordelt = fordelLag(rader, { klubbKortnavn: 'Halsen', cupLag: LAG })
ok('hjemmelaget vårt gjenkjennes', fordelt[0].our_team === 'bla' && fordelt[0].opponent === 'Ready Blå', `${fordelt[0].our_team} mot ${fordelt[0].opponent}`)
ok('bortelaget vårt gjenkjennes', fordelt[1].our_team === 'rod' && fordelt[1].opponent === 'Svene IL', `${fordelt[1].our_team} mot ${fordelt[1].opponent}`)
ok('begge er sikre', fordelt.every(f => f.sikker))

// ---------- 2. «Lag 1 / Lag 2», norsk datoformat, Excel-klokkeslett ----------
rader = parseCupRows(ark([
  { 'Kamp nr': 'A1', 'Dato': '2026-08-09', 'Kl.': 0.5, 'Sted': 'Virik 7', 'Lag 1': 'Fossum IF', 'Lag 2': 'Halsen Blå' }
]))
ok('«Lag 1/Lag 2» leses som lag', rader.length === 1 && rader[0].home_team === 'Fossum IF', JSON.stringify(rader[0] || {}))
ok('Excel-desimaltid blir 12:00', rader[0]?.match_time === '12:00', rader[0]?.match_time)
ok('«Sted» leses som bane', rader[0]?.pitch === 'Virik 7', rader[0]?.pitch)

// ---------- 3. Støy skal falle ut ----------
rader = parseCupRows(ark([
  { 'Dato': '08.08.2026', 'Hjemmelag': 'Halsen Blå', 'Bortelag': 'Ready Blå' },
  { 'Dato': '', 'Hjemmelag': 'Uten dato', 'Bortelag': 'Noen' },
  { 'Dato': '08.08.2026', 'Hjemmelag': 'Bare ett lag', 'Bortelag': '' },
  { 'Dato': 'Med vennlig hilsen', 'Hjemmelag': '', 'Bortelag': '' }
]))
ok('rader uten dato eller motstander faller ut', rader.length === 1, `${rader.length} igjen`)

// ---------- 4. Gjettet skal MERKES, ikke skjules ----------
//
// Arrangøren skrev «Halsen IF 2». Vi meldte på «Blå» og «Rød». Klubben
// stemmer, laget gjør ikke — og da vet vi at kampen er vår, men ikke hvem sin.
rader = parseCupRows(ark([
  { 'Dato': '08.08.2026', 'Hjemmelag': 'Halsen IF 2', 'Bortelag': 'Korsvoll Rovers' }
]))
fordelt = fordelLag(rader, { klubbKortnavn: 'Halsen', cupLag: LAG })
ok('klubbtreff alene er IKKE sikkert', fordelt[0].sikker === false, String(fordelt[0].sikker))
ok('motstanderen er likevel riktig', fordelt[0].opponent === 'Korsvoll Rovers', fordelt[0].opponent)
ok('gjettet lander på et ekte lag', LAG.some(l => l.slug === fordelt[0].our_team), fordelt[0].our_team)
ok('rå-linja er med så brukeren kan se hva som sto', /Halsen IF 2/.test(fordelt[0].raw), fordelt[0].raw)

// Kjenner vi ingen av lagene, er ALT gjett.
fordelt = fordelLag(rader, { klubbKortnavn: 'Ørn', cupLag: LAG })
ok('helt ukjent oppsett merkes som gjett', fordelt[0].sikker === false)

// ---------- 5. Våre to lag møter hverandre ----------
rader = parseCupRows(ark([
  { 'Dato': '09.08.2026', 'Hjemmelag': 'Halsen Blå', 'Bortelag': 'Halsen Rød' }
]))
fordelt = fordelLag(rader, { klubbKortnavn: 'Halsen', cupLag: LAG })
ok('intern kamp havner på ett av lagene', ['bla', 'rod'].includes(fordelt[0].our_team), fordelt[0].our_team)
ok('det andre laget står som motstander', /Halsen R|Halsen B/.test(fordelt[0].opponent), fordelt[0].opponent)

// ---------- 6. Delvis navnetreff skal ikke slå til ----------
//
// «Blåbærmyra» inneholder ikke laget «Blå» som eget ord. Uten ordgrensa ville
// enhver bane eller motstander med fargen i seg kapret kampen.
rader = parseCupRows(ark([
  { 'Dato': '09.08.2026', 'Hjemmelag': 'Blåbærmyra IL', 'Bortelag': 'Rødsand FK' }
]))
fordelt = fordelLag(rader, { klubbKortnavn: 'Halsen', cupLag: LAG })
ok('delvis ordtreff gjenkjennes ikke som vårt lag', fordelt[0].sikker === false, fordelt[0].raw)

console.log(feilet ? `\n${feilet} FEIL` : '\nAlt grønt')
process.exit(feilet ? 1 : 0)
