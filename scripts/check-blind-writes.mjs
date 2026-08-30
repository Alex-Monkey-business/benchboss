// Blindskriving mot basen: `npm run check:writes`
//
// 30. august satt Sten fast i veiviseren i en time. «Til Hjem» ga bare en grønn
// toast, hver gang. Årsaken var ikke en feil — det var fraværet av en:
//
//   supabase.from('cohorts').update({ birth_year: 2015 }).eq('id', id)
//
// Han var trener, ikke admin, og RLS filtrerte bort raden. PostgREST traff null
// rader og svarte «ok». `error` var null. Appen gikk videre, sa «Klart.», og
// guarden sendte ham tilbake til siden han sto på. Ingen logg, ingen krasj,
// ingenting å rapportere. Den eneste måten å oppdage det på var å være Sten.
//
// En skriving uten `.select()` kan ikke skille «lagret» fra «nektet». Derfor
// er den forbudt her — ikke oppdaget i prod, men stoppet før den bygges.
//
// Trenger du unntaket, skriv det: en linje `// blindskriving: <grunn>` rett
// over kallet. Da er det et valg noen har tatt, ikke noe som gled forbi.
//
// De 26 som fantes da regelen kom, står i blind-writes-baseline.json. De er
// gjeld, ikke tilgitt: tallet skrives ut ved hver build. Grunnen til at de ikke
// ble rettet i samme slengen er at «null rader» ikke betyr det samme overalt —
// en delete av noe som alt er borte er greit, en update som ikke traff er det
// ikke. Hvert sted trenger et svar på hva null rader skal bety, og det svaret
// kan ikke drysses på.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
// Bare de stille. En `insert` som RLS nekter BRYTER — `with check` gir 42501 og
// koden får en ekte feil. En `update` eller `delete` blir filtrert av `using`,
// treffer null rader og svarer «ok». Det er den forskjellen hele denne filen
// handler om, så insert står ikke på lista.
const SKRIV = ['update', 'delete', 'upsert']
const UNNTAK = /\/\/\s*blindskriving:/

function filer(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? filer(p) : (/\.(js|vue)$/.test(n) ? [p] : [])
  })
}

// Hopper over strenger og kommentarer, så en parentes i en tekst ikke teller.
function hoppOverStøy(s, i) {
  const c = s[i]
  if (c === '"' || c === "'" || c === '`') {
    let j = i + 1
    while (j < s.length) {
      if (s[j] === '\\') { j += 2; continue }
      if (s[j] === c) return j + 1
      // Malstreng med ${...} kan inneholde hva som helst; vi trenger bare å
      // komme oss forbi den uten å telle parenteser feil.
      if (c === '`' && s[j] === '$' && s[j + 1] === '{') {
        let d = 1
        j += 2
        while (j < s.length && d > 0) {
          const k = hoppOverStøy(s, j)
          if (k !== j) { j = k; continue }
          if (s[j] === '{') d++
          if (s[j] === '}') d--
          j++
        }
        continue
      }
      j++
    }
    return j
  }
  if (c === '/' && s[i + 1] === '/') { const n = s.indexOf('\n', i); return n === -1 ? s.length : n }
  if (c === '/' && s[i + 1] === '*') { const n = s.indexOf('*/', i); return n === -1 ? s.length : n + 2 }
  return i
}

// Fra en `(`: gå til tegnet etter den matchende `)`.
function forbiParentes(s, i) {
  let d = 0
  while (i < s.length) {
    const k = hoppOverStøy(s, i)
    if (k !== i) { i = k; continue }
    if (s[i] === '(') d++
    if (s[i] === ')') { d--; if (d === 0) return i + 1 }
    i++
  }
  return i
}

// Fra `.from(` og framover: hvilke ledd henger på kjeden?
function leddIKjeden(s, i) {
  const ledd = []
  while (i < s.length) {
    while (i < s.length) {
      const k = hoppOverStøy(s, i)
      if (k !== i) { i = k; continue }
      if (/\s/.test(s[i])) { i++; continue }
      break
    }
    if (s[i] !== '.') break
    const m = /^\.\s*([A-Za-z_$][\w$]*)\s*\(/.exec(s.slice(i, i + 60))
    if (!m) break
    ledd.push(m[1])
    i = forbiParentes(s, i + m[0].length - 1)
  }
  return ledd
}

const funn = []
for (const f of filer(SRC)) {
  const s = readFileSync(f, 'utf8')
  const re = /\.from\s*\(/g
  let m
  while ((m = re.exec(s))) {
    const etter = forbiParentes(s, m.index + m[0].length - 1)
    const ledd = leddIKjeden(s, etter)
    const skriv = ledd.find(l => SKRIV.includes(l))
    if (!skriv || ledd.includes('select')) continue
    const linje = s.slice(0, m.index).split('\n').length
    const før = s.split('\n').slice(Math.max(0, linje - 3), linje).join('\n')
    if (UNNTAK.test(før)) continue
    const kilde = s.slice(m.index, forbiParentes(s, m.index + m[0].length - 1) + 400)
      .split('\n').slice(0, ledd.length + 2).join(' ').replace(/\s+/g, ' ').trim()
    funn.push({ fil: relative(ROOT, f), linje, skriv, kjede: ledd.join('.'), kilde })
  }
}

// Nøkkelen er fil + en hash av selve kallet — ikke linjenummer, som flytter seg
// hver gang noen skriver en kommentar over, og ikke rekkefølge, som gjorde at et
// NYTT kall øverst i fila fikk regelen til å peke på et gammelt lenger nede.
// Første forsøk gjorde nettopp det. En sjekk som melder feil sted er den samme
// løgnen den er ment å ta.
//
// To identiske kall i samme fil får samme hash. Da telles de som et multisett:
// finnes det flere enn baselinen kjenner, er det ett for mye — uansett hvilket.
const teller = new Map()
for (const v of funn) {
  const h = createHash('sha1').update(v.kilde).digest('hex').slice(0, 12)
  const k = `${v.fil} ${v.skriv} ${h}`
  const n = (teller.get(k) || 0) + 1
  teller.set(k, n)
  v.nøkkel = n === 1 ? k : `${k} #${n}`
}

const BASELINE = join(ROOT, 'scripts/blind-writes-baseline.json')
if (process.argv.includes('--oppdater')) {
  writeFileSync(BASELINE, JSON.stringify(funn.map(v => v.nøkkel).sort(), null, 2) + '\n')
  console.log(`Baseline skrevet: ${funn.length} kjente steder.`)
  process.exit(0)
}

let kjente = []
try { kjente = JSON.parse(readFileSync(BASELINE, 'utf8')) } catch { /* ingen baseline ennå */ }
const kjentSett = new Set(kjente)
const nye = funn.filter(v => !kjentSett.has(v.nøkkel))
const gjenstår = funn.filter(v => kjentSett.has(v.nøkkel)).length

if (nye.length) {
  console.error(`Ny blindskriving mot basen — ${nye.length} sted${nye.length > 1 ? 'er' : ''}:\n`)
  for (const v of nye) {
    console.error(`  ${v.fil}:${v.linje}`)
    console.error(`    .from(…).${v.kjede}  — .${v.skriv}() uten .select()`)
    console.error(`    Legg på .select('id') og sjekk at data har rader. Eller skriv`)
    console.error(`    // blindskriving: <grunn> over kallet hvis den skal være blind.\n`)
  }
  console.error('En skriving som ikke leser tilbake, kan ikke vite om den skjedde.')
  console.error('Er den blind med vilje, skriv grunnen — eller kjør `npm run check:writes -- --oppdater`')
  console.error('hvis du bevisst flytter grensa.')
  process.exit(1)
}

if (gjenstår) console.log(`Ingen nye blindskrivinger. ${gjenstår} kjente står igjen som gjeld.`)
else console.log('Ingen blindskriving: hver update/delete/upsert leser tilbake det den skrev.')
