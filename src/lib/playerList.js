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

// Excel/CSV: første ark, første kolonne med tekst. Har arket en «Navn»-
// kolonne, brukes den.
//
// xlsx lastes først når noen faktisk velger en fil. Med en vanlig import på
// toppen havner 142 kB gzip i Hjem-chunken — parseren brukes én gang i et
// kulls levetid, Hjem åpnes hver dag.
export async function parsePlayerWorkbook(file) {
  const [XLSX, buf] = await Promise.all([import('xlsx'), file.arrayBuffer()])
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!rows.length) return []

  const header = rows[0].map(c => String(c || '').toLowerCase().trim())
  let col = header.findIndex(h => ['navn', 'name', 'spiller'].includes(h))
  if (col === -1) {
    // Første kolonne der flertallet av cellene er tekst med bokstaver.
    const width = Math.max(...rows.map(r => r.length))
    for (let c = 0; c < width; c++) {
      const vals = rows.map(r => r[c]).filter(v => v !== '' && v != null)
      if (vals.length && vals.filter(v => /[a-zæøå]/i.test(String(v))).length / vals.length > 0.6) { col = c; break }
    }
  }
  if (col === -1) return []
  return parsePlayerList(rows.map(r => r[col]).join('\n'))
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
