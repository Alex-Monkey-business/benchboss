#!/usr/bin/env node
// Lagrullering til Høst 2026.
//
// Troppene settes på nytt hver sesong. Dette scriptet:
//   1. Fryser dagens fordeling som Vår 2026 i player_season_teams, slik at
//      vårens kamper og statistikk beholder lagfargene de faktisk hadde.
//   2. Legger inn nye spillere som ikke finnes fra før (Emil).
//   3. Skriver høstens fordeling til både player_season_teams og
//      players.primary_team — sistnevnte er «laget akkurat nå».
//   4. Setter lånestatus: bare keeperne kan lånes ut mellom lagene.
//   5. Retter trenertildelingene på høstkampene, siden trenerne rullerer med.
//
// Forutsetter at supabase-migration-player-season-teams.sql er kjørt.
// Idempotent — kan kjøres om igjen uten å doble noe.
//
// Usage:
//   node scripts/migrate-lagrullering-host-2026.mjs --dry-run
//   node scripts/migrate-lagrullering-host-2026.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Speiler COACH_TEAMS i src/lib/coachTeams.js. Scriptene her holder seg
// selvstendige fra src/ (samme som import-matches.mjs) — dette er en
// engangskjøring, så de to kan ikke drifte fra hverandre i praksis.
const COACH_TEAMS = {
  gronn: ['Simon', 'Alex'],
  rod: ['Trond'],
  hvit: ['Iver', 'Jacob'],
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map(l => l.split('=').map(s => s.trim()))
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const dryRun = process.argv.includes('--dry-run')

const FROM_SEASON = 'Vår 2026'   // fordelingen som gjelder i dag fryses hit
const TO_SEASON = 'Høst 2026'

// Lappen fra trenermøtet. Lag 1 = Rød, lag 2 = Hvit, lag 3 = Grønn.
const ROSTER = {
  rod:   ['Jonas', 'Edvin', 'Isak', 'Andreas', 'Emrik K', 'Kyryl', 'Kasper', 'Theis', 'Elias'],
  hvit:  ['Syver', 'Aksel', 'Helmer', 'Eremias', 'Theo', 'Kornelius', 'Torbjørn', 'Petter', 'Emil'],
  gronn: ['Matheo', 'Cornelius', 'William', 'Emerik U', 'Julian', 'Mathias', 'Lavrans', 'Eilert', 'Lennox'],
}

// Keeperne kan lånes ut til de andre lagene ved behov.
const LOAN_ELIGIBLE = ['Lennox', 'Elias']

const log = (...a) => console.log(...a)
const fail = (msg) => { console.error(msg); process.exit(1) }

const { data: seasons } = await supabase.from('seasons').select('id, name')
const from = seasons?.find(s => s.name === FROM_SEASON)
const to = seasons?.find(s => s.name === TO_SEASON)
if (!from) fail(`Fant ikke sesongen "${FROM_SEASON}"`)
if (!to) fail(`Fant ikke sesongen "${TO_SEASON}"`)

const { data: players } = await supabase.from('players').select('*')
const { data: coaches } = await supabase.from('coaches').select('id, name')

// ---- Sanity: navnene på lappen må stemme med spillerne vi har ----
const wanted = Object.values(ROSTER).flat()
const known = new Set(players.map(p => p.name))
const missing = wanted.filter(n => !known.has(n))
const orphaned = players.filter(p => !wanted.includes(p.name)).map(p => p.name)

log(`Spillere i basen: ${players.length}   på lappen: ${wanted.length}`)
if (missing.length) log(`Nye spillere som opprettes: ${missing.join(', ')}`)
if (orphaned.length) log(`IKKE på lappen (beholdes, men uten lag i ${TO_SEASON}): ${orphaned.join(', ')}`)

const dupes = wanted.filter((n, i) => wanted.indexOf(n) !== i)
if (dupes.length) fail(`Samme spiller står på flere lag: ${dupes.join(', ')}`)

// ---- 1. Frys dagens fordeling som vårens ----
const springRows = players
  .filter(p => p.primary_team)
  .map(p => ({ player_id: p.id, season_id: from.id, team: p.primary_team, loan_eligible: !!p.loan_eligible }))

log(`\n1. Fryser ${springRows.length} spillere som ${FROM_SEASON}`)
for (const [team, names] of Object.entries(ROSTER)) {
  const before = players.filter(p => p.primary_team === team).map(p => p.name)
  log(`   ${team.padEnd(6)} var: ${before.join(', ') || '—'}`)
  log(`   ${''.padEnd(6)} blir: ${names.join(', ')}`)
}

if (!dryRun) {
  const { error } = await supabase
    .from('player_season_teams')
    .upsert(springRows, { onConflict: 'player_id,season_id' })
  if (error) fail(`Kunne ikke fryse ${FROM_SEASON}: ${error.message}`)
}

// ---- 2. Opprett nye spillere ----
let roster = [...players]
if (missing.length) {
  log(`\n2. Oppretter ${missing.length} ny(e) spiller(e)`)
  if (!dryRun) {
    const { data, error } = await supabase
      .from('players')
      .insert(missing.map(name => ({ name })))
      .select()
    if (error) fail(`Kunne ikke opprette spillere: ${error.message}`)
    roster = [...roster, ...data]
  }
} else {
  log('\n2. Ingen nye spillere')
}

// ---- 3+4. Høstens fordeling og lånestatus ----
const teamOf = name => Object.entries(ROSTER).find(([, ns]) => ns.includes(name))?.[0] || null
const idOf = name => roster.find(p => p.name === name)?.id

log(`\n3. Skriver ${TO_SEASON}-fordelingen (${wanted.length} spillere)`)
log(`4. Lånespillere: ${LOAN_ELIGIBLE.join(', ')} — resten låses til eget lag`)

if (!dryRun) {
  const autumnRows = []
  for (const p of roster) {
    const team = teamOf(p.name)
    const loan = LOAN_ELIGIBLE.includes(p.name)
    const { error } = await supabase
      .from('players')
      .update({ primary_team: team, loan_eligible: loan })
      .eq('id', p.id)
    if (error) fail(`Kunne ikke oppdatere ${p.name}: ${error.message}`)
    if (team) autumnRows.push({ player_id: p.id, season_id: to.id, team, loan_eligible: loan })
  }
  const { error } = await supabase
    .from('player_season_teams')
    .upsert(autumnRows, { onConflict: 'player_id,season_id' })
  if (error) fail(`Kunne ikke skrive ${TO_SEASON}: ${error.message}`)
}

// ---- 5. Trenertildelinger på høstkampene ----
const { data: autumnMatches } = await supabase
  .from('matches').select('id, home_team, away_team').eq('season_id', to.id)

const colorFromName = n => {
  const s = (n || '').toLowerCase()
  if (s.includes('grønn') || s.includes('gronn')) return 'gronn'
  if (s.includes('rød') || s.includes('rod')) return 'rod'
  if (s.includes('hvit')) return 'hvit'
  return ''
}
const isHalsen = n => (n || '').toLowerCase().includes('halsen')

const wantedCoaches = new Map()
for (const m of autumnMatches) {
  const colors = [m.home_team, m.away_team].filter(isHalsen).map(colorFromName).filter(Boolean)
  const names = new Set(colors.flatMap(c => COACH_TEAMS[c] || []))
  const ids = coaches.filter(c => names.has(c.name)).map(c => c.id)
  wantedCoaches.set(m.id, ids)
}

log(`\n5. Setter trenere på ${autumnMatches.length} høstkamper etter nytt oppsett`)
for (const [color, names] of Object.entries(COACH_TEAMS)) {
  log(`   ${color.padEnd(6)} → ${names.join(', ')}`)
}

if (!dryRun) {
  const ids = autumnMatches.map(m => m.id)
  const { error: delErr } = await supabase.from('match_coaches').delete().in('match_id', ids)
  if (delErr) fail(`Kunne ikke fjerne gamle trenertildelinger: ${delErr.message}`)

  const rows = [...wantedCoaches.entries()]
    .flatMap(([match_id, coachIds]) => coachIds.map(coach_id => ({ match_id, coach_id })))
  const { error: insErr } = await supabase.from('match_coaches').insert(rows)
  if (insErr) fail(`Kunne ikke sette nye trenertildelinger: ${insErr.message}`)
  log(`   ${rows.length} tildelinger skrevet`)
}

if (dryRun) {
  log('\n--dry-run: ingenting ble skrevet.')
  process.exit(0)
}

// ---- Fasit ----
const { data: after } = await supabase.from('players').select('name, primary_team, loan_eligible').order('name')
const { data: hist } = await supabase.from('player_season_teams').select('season_id, team')
log('\nFerdig.')
for (const [team] of Object.entries(ROSTER)) {
  const names = after.filter(p => p.primary_team === team).map(p => p.name + (p.loan_eligible ? ' *' : ''))
  log(`  ${team.padEnd(6)} (${names.length}): ${names.join(', ')}`)
}
const none = after.filter(p => !p.primary_team).map(p => p.name)
if (none.length) log(`  uten lag: ${none.join(', ')}`)
log(`\nHistorikk lagret: ${hist.filter(h => h.season_id === from.id).length} rader for ${FROM_SEASON}, ${hist.filter(h => h.season_id === to.id).length} for ${TO_SEASON}`)
