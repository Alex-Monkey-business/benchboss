#!/usr/bin/env node
// Import Halsen matches from Excel files into Supabase.
// Parses one file per team, filters to Halsen-only matches,
// deletes existing matches in the detected season, and bulk-inserts the new ones.
//
// Usage:
//   node scripts/import-matches.mjs <file1.xlsx> [file2.xlsx ...]
//   node scripts/import-matches.mjs --dry-run <file1.xlsx> ...

import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = Object.fromEntries(
  envFile.split('\n').filter(Boolean).map(l => l.split('=').map(s => s.trim()))
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const files = args.filter(a => a !== '--dry-run')

if (files.length === 0) {
  console.error('Usage: node scripts/import-matches.mjs [--dry-run] <file1.xlsx> ...')
  process.exit(1)
}

const MONTHS = { jan:'01', feb:'02', mar:'03', apr:'04', mai:'05', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', okt:'10', oct:'10', nov:'11', des:'12', dec:'12' }

function parseDate(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value)
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  const str = String(value).trim()
  const mName = str.match(/^(\d{1,2})[-.](\w+)$/)
  if (mName) {
    const month = MONTHS[mName[2].toLowerCase().slice(0,3)]
    if (month) return `${new Date().getFullYear()}-${month}-${mName[1].padStart(2,'0')}`
  }
  const dot = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/)
  if (dot) {
    const y = dot[3].length === 2 ? '20'+dot[3] : dot[3]
    return `${y}-${dot[2].padStart(2,'0')}-${dot[1].padStart(2,'0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  return null
}

function parseTime(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number' && value < 1) {
    const totalMin = Math.round(value * 24 * 60)
    return `${String(Math.floor(totalMin/60)).padStart(2,'0')}:${String(totalMin%60).padStart(2,'0')}`
  }
  const m = String(value).trim().match(/^(\d{1,2})[:.](\d{2})/)
  return m ? `${m[1].padStart(2,'0')}:${m[2]}` : null
}

const COLS = {
  runde:'round', dato:'match_date', dag:'match_day', tid:'match_time',
  klokka:'match_time', klokkeslett:'match_time', kl:'match_time',
  hjemmelag:'home_team', hjemme:'home_team',
  bortelag:'away_team', borte:'away_team',
  turnering:'division', avdeling:'division', avd:'division',
  dommer:'referee', dommere:'referee'
}

function parseFile(path) {
  const wb = XLSX.readFile(path)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: true })
  return rows.map(row => {
    const out = {}
    for (const [k, v] of Object.entries(row)) {
      const mapped = COLS[k.toString().toLowerCase().trim()]
      if (mapped) out[mapped] = v
    }
    return {
      round: out.round != null ? String(out.round) : null,
      match_date: parseDate(out.match_date),
      match_day: out.match_day || null,
      match_time: parseTime(out.match_time),
      home_team: String(out.home_team || '').trim(),
      away_team: String(out.away_team || '').trim(),
      division: out.division ? String(out.division).trim() : null,
      referee: out.referee ? String(out.referee).trim() : null,
      fee_amount: 200
    }
  }).filter(m => m.home_team && m.away_team && m.match_date)
}

function isHalsen(name) {
  return (name || '').toLowerCase().includes('halsen')
}

function detectSeasonName(matches) {
  const dates = matches.map(m => new Date(m.match_date)).filter(d => !isNaN(d))
  if (!dates.length) return null
  const counts = {}
  for (const d of dates) {
    const m = d.getMonth() + 1
    counts[m] = (counts[m] || 0) + 1
  }
  const top = Number(Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0])
  let type
  if (top >= 11 || top <= 3) type = 'Vinter'
  else if (top >= 4 && top <= 7) type = 'Vår'
  else type = 'Høst'
  const sorted = [...dates].sort((a,b) => a-b)
  let year
  if (type === 'Vinter') {
    const spring = sorted.filter(d => d.getMonth()+1 <= 3)
    year = spring.length ? spring[0].getFullYear() : sorted[sorted.length-1].getFullYear()+1
  } else {
    year = sorted[Math.floor(sorted.length/2)].getFullYear()
  }
  return `${type} ${year}`
}

console.log(`Parser ${files.length} fil(er)...\n`)

const allMatches = []
for (const f of files) {
  const path = resolve(f)
  const parsed = parseFile(path)
  const halsen = parsed.filter(m => isHalsen(m.home_team) || isHalsen(m.away_team))
  const teams = new Set()
  halsen.forEach(m => {
    if (isHalsen(m.home_team)) teams.add(m.home_team)
    if (isHalsen(m.away_team)) teams.add(m.away_team)
  })
  console.log(`  ${f}: ${halsen.length} Halsen-kamper  (${[...teams].join(', ')})`)
  allMatches.push(...halsen)
}

// Dedup same date + time + home + away (internal matches may appear in both files)
const seen = new Set()
const unique = []
for (const m of allMatches) {
  const key = `${m.match_date}|${m.match_time}|${m.home_team}|${m.away_team}`
  if (!seen.has(key)) {
    seen.add(key)
    unique.push(m)
  }
}

const seasonName = detectSeasonName(unique)
console.log(`\nTotalt ${unique.length} unike Halsen-kamper → sesong "${seasonName}"`)

if (dryRun) {
  console.log('\n--dry-run: ingen endringer skrevet til Supabase.')
  console.log('\nFørste 5 kamper:')
  unique.slice(0, 5).forEach(m => console.log(' ', m))
  process.exit(0)
}

// Find or create season
const { data: existing } = await supabase.from('seasons').select('*').eq('name', seasonName)
let season = existing?.[0]
if (!season) {
  const { data, error } = await supabase.from('seasons').insert({ name: seasonName }).select().single()
  if (error) { console.error('Feil ved opprettelse av sesong:', error); process.exit(1) }
  season = data
  console.log(`Opprettet sesong "${seasonName}" (${season.id})`)
} else {
  console.log(`Bruker eksisterende sesong "${seasonName}" (${season.id})`)
}

// Delete all existing matches in this season (cascades to match_coaches + expenses)
const { error: delErr, count } = await supabase
  .from('matches')
  .delete({ count: 'exact' })
  .eq('season_id', season.id)
if (delErr) { console.error('Feil ved sletting:', delErr); process.exit(1) }
console.log(`Slettet ${count ?? 0} eksisterende kamper fra sesongen`)

// Insert new matches
const payload = unique.map(m => ({ ...m, season_id: season.id }))
const { data: inserted, error: insErr } = await supabase
  .from('matches')
  .insert(payload)
  .select('id')
if (insErr) { console.error('Feil ved innsetting:', insErr); process.exit(1) }
console.log(`Importerte ${inserted.length} kamper til "${seasonName}"`)
console.log('\nFerdig.')
