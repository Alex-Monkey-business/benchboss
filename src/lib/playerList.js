// Spillerlister fra der de allerede finnes: limt inn fra Spond/Hoopit/et
// regneark, eller lastet opp som Excel. Målet er at treneren aldri skriver
// 18 navn én og én.

const HEADER_WORDS = new Set(['navn', 'name', 'spiller', 'spillere', 'fornavn', 'etternavn', 'lag', 'nr', 'nr.', 'draktnummer'])

function cleanName(raw) {
  let s = String(raw || '')
    .replace(/\t/g, ' ')
    // «1. Ola», «- Ola», «• Ola», «12 Ola»
    .replace(/^\s*(?:[-–•*]|\d{1,3}[.)]?)\s+/, '')
    // «Ola Nordmann 7», «Ola Nordmann (7)», «Ola Nordmann #7»
    .replace(/\s+(?:#|\(|nr\.?\s*)?\d{1,3}\)?\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!s) return ''
  if (HEADER_WORDS.has(s.toLowerCase())) return ''
  // Rene tall eller tegn er ikke navn.
  if (!/[a-zæøåA-ZÆØÅ]/.test(s)) return ''
  return s
}

// Én per linje er hovedveien. Komma og semikolon godtas også — men bare når
// linja ikke ser ut som «Etternavn, Fornavn».
export function parsePlayerList(text) {
  const lines = String(text || '').split(/\r?\n/)
  const out = []
  for (const line of lines) {
    let parts = [line]
    if (/[;,]/.test(line)) {
      const split = line.split(/[;,]/).map(s => s.trim()).filter(Boolean)
      // To deler der begge er ett ord → «Nordmann, Ola» → behold som ett navn.
      const looksLikeSurnameFirst = split.length === 2 && split.every(p => !/\s/.test(p)) && line.includes(',')
      parts = looksLikeSurnameFirst ? [`${split[1]} ${split[0]}`] : split
    }
    for (const p of parts) {
      const name = cleanName(p)
      if (name) out.push(name)
    }
  }
  // Duplikater (samme navn to ganger i lista) tas én gang.
  const seen = new Set()
  return out.filter(n => {
    const k = n.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// Excel/CSV: første ark. Navnekolonnen finnes alltid; har arket også en
// LAG-kolonne, tas den med — da slipper treneren å gjøre jobben lag for lag.
//
// Returnerer alltid [{ name, team }]. `team` er teksten slik den står i arket
// («Grønn», «Stag G9 Grønn»); å koble den til et av kullets lag hører hjemme
// der lagene er kjent, ikke her.
//
// xlsx lastes først når noen faktisk velger en fil. Med en vanlig import på
// toppen havner 142 kB gzip i Hjem-chunken — parseren brukes én gang i et
// kulls levetid, Hjem åpnes hver dag.
const NAME_HEADERS = ['navn', 'name', 'spiller', 'spillernavn']
const TEAM_HEADERS = ['lag', 'team', 'gruppe', 'lagnavn']

export async function parsePlayerWorkbook(file) {
  const [XLSX, buf] = await Promise.all([import('xlsx'), file.arrayBuffer()])
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!rows.length) return []

  const header = rows[0].map(c => String(c || '').toLowerCase().trim())
  let navnKol = header.findIndex(h => NAME_HEADERS.includes(h))
  const lagKol = header.findIndex(h => TEAM_HEADERS.includes(h))
  const harHeader = navnKol !== -1 || lagKol !== -1

  if (navnKol === -1) {
    // Første kolonne der flertallet av cellene er tekst med bokstaver — og
    // ikke lagkolonnen, om den er funnet.
    const width = Math.max(...rows.map(r => r.length))
    for (let c = 0; c < width; c++) {
      if (c === lagKol) continue
      const vals = rows.map(r => r[c]).filter(v => v !== '' && v != null)
      if (vals.length && vals.filter(v => /[a-zæøå]/i.test(String(v))).length / vals.length > 0.6) { navnKol = c; break }
    }
  }
  if (navnKol === -1) return []

  const data = harHeader ? rows.slice(1) : rows
  const ut = []
  const sett = new Set()
  for (const r of data) {
    // Én celle kan romme flere navn («Ola, Kari»); parsePlayerList kan det.
    for (const name of parsePlayerList(String(r[navnKol] ?? ''))) {
      const k = name.toLowerCase()
      if (sett.has(k)) continue
      sett.add(k)
      ut.push({ name, team: lagKol === -1 ? '' : String(r[lagKol] ?? '').trim() })
    }
  }
  return ut
}

// Lagteksten fra et regneark mot kullets lag. «Grønn», «gronn», «GRØNN» og
// «Stag G9 Grønn» skal alle finne laget som heter Grønn.
export function matchTeam(text, teams) {
  const n = normTeam(text)
  if (!n) return ''
  // Lengste navn først, så «Stag 1» ikke stjeler «Stag 10».
  for (const t of [...teams].sort((a, b) => normTeam(b.name).length - normTeam(a.name).length)) {
    const tn = normTeam(t.name)
    if (tn && (n === tn || n.includes(tn))) return t.slug
    if (t.slug && n === normTeam(t.slug)) return t.slug
  }
  return ''
}

function normTeam(s) {
  return String(s || '').toLowerCase()
    .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a')
    .replace(/\s+/g, ' ').trim()
}

// Samme regel som bb_slugify i basen.
export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .replace(/[éè]/g, 'e').replace(/ü/g, 'u').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
