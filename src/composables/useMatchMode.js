import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { scoped } from '../lib/scope'
import { registerReset } from '../stores/dataReset'
import { planTransfer, transferableSeconds } from '../lib/timeTransfer'

// Event-sourced match mode. Spilletid telles ALDRI med en teller — den regnes
// ut fra kampklokka (match_sessions) + opphold på banen (match_stints).
// setInterval under driver KUN displayet; sannheten ligger i databasen og
// rekonstrueres fra running_since ved innlasting (overlever refresh/låst skjerm).

const session = ref(null)     // { match_id, status, clock_base_seconds, running_since, period }
const stints = ref([])        // kan spenne flere kamper når statistikk er lastet
const now = ref(Date.now())   // display-tikk

// Kun data. Tikk-timeren eies av komponentene som monterer den (ref-tellet),
// og skal ikke røres her.
registerReset(() => { session.value = null; stints.value = [] })

// Ref-tellet 1s-intervall — kun for å redrive currentClock i UI.
let tickTimer = null
let tickRefs = 0
function startClockTick() {
  tickRefs++
  if (tickTimer) return
  tickTimer = setInterval(() => { now.value = Date.now() }, 1000)
}
function stopClockTick() {
  tickRefs = Math.max(0, tickRefs - 1)
  if (tickRefs === 0 && tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

function nowIso() {
  return new Date().toISOString()
}

// Aktuell kampklokke i sekunder (avledet — aldri lagret direkte).
function computeClock(sess, nowMs) {
  if (!sess) return 0
  if (sess.status === 'running' && sess.running_since) {
    const elapsed = (nowMs - Date.parse(sess.running_since)) / 1000
    return Math.max(0, Math.floor(sess.clock_base_seconds + elapsed))
  }
  return sess.clock_base_seconds || 0
}

export function useMatchMode() {
  const currentClock = computed(() => computeClock(session.value, now.value))
  const isRunning = computed(() => session.value?.status === 'running')

  // ── Henting ───────────────────────────────────────────────────────────────
  async function fetchSession(matchId) {
    if (!isSupabaseConfigured) {
      if (session.value?.match_id !== matchId) session.value = null
      return session.value
    }
    const { data } = await supabase
      .from('match_sessions')
      .select('*')
      .eq('match_id', matchId)
      .maybeSingle()
    session.value = data || null
    return session.value
  }

  async function fetchStints(matchId) {
    if (!isSupabaseConfigured) {
      return stints.value.filter(s => s.match_id === matchId)
    }
    const { data } = await supabase
      .from('match_stints')
      .select('*')
      .eq('match_id', matchId)
    if (data) {
      stints.value = stints.value.filter(s => s.match_id !== matchId).concat(data)
    }
    return stints.value.filter(s => s.match_id === matchId)
  }

  // Alle stints på tvers av kamper — sesongstatistikk.
  // Demo: et lite sett lukkede stints fra dm-1 (Rød) og dm-2 (Grønn) så
  // spilletid per lag er synlig på statistikksiden uten Supabase.
  async function fetchAllStints() {
    if (!isSupabaseConfigured) {
      if (stints.value.length === 0) stints.value = [
        { id: 'ds-1', match_id: 'dm-1', player_id: 'p-1', role: 'keeper', position: 'gk', on_clock: 0, off_clock: 3600 },
        { id: 'ds-2', match_id: 'dm-1', player_id: 'p-2', role: 'field', position: 'd1', on_clock: 0, off_clock: 3300 },
        { id: 'ds-3', match_id: 'dm-1', player_id: 'p-3', role: 'field', position: 'd2', on_clock: 0, off_clock: 2700 },
        { id: 'ds-4', match_id: 'dm-1', player_id: 'p-4', role: 'field', position: 'm1', on_clock: 600, off_clock: 3600 },
        { id: 'ds-5', match_id: 'dm-1', player_id: 'p-5', role: 'field', position: 'f1', on_clock: 1800, off_clock: 3600 },
        { id: 'ds-6', match_id: 'dm-2', player_id: 'p-10', role: 'field', position: 'm1', on_clock: 0, off_clock: 3600 },
        { id: 'ds-7', match_id: 'dm-2', player_id: 'p-12', role: 'field', position: 'd1', on_clock: 0, off_clock: 2400 },
        { id: 'ds-8', match_id: 'dm-2', player_id: 'p-14', role: 'field', position: 'f1', on_clock: 900, off_clock: 3600 },
      ]
      return stints.value
    }
    const { data } = await scoped(supabase.from('match_stints').select('*'))
    if (data) stints.value = data
    return stints.value
  }

  // ── Session-skriving ────────────────────────────────────────────────────────
  async function writeSession(matchId, patch) {
    const next = { match_id: matchId, ...session.value, ...patch, updated_at: nowIso() }
    if (!isSupabaseConfigured) {
      session.value = next
      return next
    }
    const { data, error } = await supabase
      .from('match_sessions')
      .upsert(next, { onConflict: 'match_id' })
      .select()
      .single()
    if (error) throw error
    if (data) session.value = data
    return session.value
  }

  async function insertStints(rows) {
    if (!isSupabaseConfigured) {
      const created = rows.map((r, i) => ({ id: 'ms-' + Date.now() + '-' + i, off_clock: null, ...r }))
      stints.value.push(...created)
      return created
    }
    const { data, error } = await supabase.from('match_stints').insert(rows).select()
    if (error) throw error
    if (data) stints.value.push(...data)
    return data || []
  }

  async function patchStint(stintId, patch) {
    if (!isSupabaseConfigured) {
      const idx = stints.value.findIndex(s => s.id === stintId)
      if (idx > -1) stints.value[idx] = { ...stints.value[idx], ...patch }
      return
    }
    const { data, error } = await supabase
      .from('match_stints')
      .update(patch)
      .eq('id', stintId)
      .select()
      .single()
    if (error) throw error
    if (data) {
      const idx = stints.value.findIndex(s => s.id === stintId)
      if (idx > -1) stints.value[idx] = data
    }
  }

  async function deleteStint(stintId) {
    if (!isSupabaseConfigured) {
      stints.value = stints.value.filter(s => s.id !== stintId)
      return
    }
    const { data, error } = await supabase
      .from('match_stints').delete().eq('id', stintId).select('id')
    if (error) throw error
    // Spilletid er hele poenget med denne skjermen. Forsvinner en periode fra
    // lista uten å forsvinne fra basen, er summene feil resten av kampen.
    if (!data?.length) throw new Error('Perioden ble ikke slettet')
    stints.value = stints.value.filter(s => s.id !== stintId)
  }

  function openStintFor(matchId, playerId) {
    return stints.value.find(
      s => s.match_id === matchId && s.player_id === playerId && s.off_clock == null
    )
  }

  // Lagre setup-tilstand (oppstilling { slotId: playerId } + kamplengde) —
  // overlever refresh og deles mellom trenere. Rører aldri en kamp i gang.
  async function saveSetup(matchId, patch) {
    if (session.value && session.value.status !== 'setup') return
    await writeSession(matchId, { status: 'setup', ...patch })
  }

  // ── Kamphandlinger ───────────────────────────────────────────────────────────
  // Avspark fra setup: start klokka og åpne stints for de som starter.
  // lineup = [{ playerId, role, position }] — én per slot i formasjonen.
  // config = { period_count, period_minutes } — skrives atomisk med starten
  // så en ventende debounced setup-lagring aldri kan rase med avsparket.
  async function startMatch(matchId, lineup, config = {}) {
    await writeSession(matchId, {
      status: 'running',
      clock_base_seconds: 0,
      running_since: nowIso(),
      period: 1,
      ...config
    })
    const rows = lineup.map(p => ({
      match_id: matchId,
      player_id: p.playerId,
      role: p.role || 'field',
      position: p.position || null,
      on_clock: 0
    }))
    await insertStints(rows)
  }

  // Pause (halvtid/stopp): frys elapsed inn i clock_base_seconds.
  async function pauseClock(matchId) {
    if (session.value?.status !== 'running') return
    const frozen = computeClock(session.value, Date.now())
    await writeSession(matchId, {
      status: 'paused',
      clock_base_seconds: frozen,
      running_since: null
    })
  }

  // Fortsett: klokka teller videre fra der den frøs (samme totale spilletid).
  async function resumeClock(matchId) {
    if (session.value?.status !== 'paused') return
    await writeSession(matchId, { status: 'running', running_since: nowIso() })
  }

  // Auto-pause ved omgangsslutt — frys klokka eksakt på grensen.
  async function endHalfAt(matchId, seconds) {
    if (session.value?.status !== 'running') return
    await writeSession(matchId, { status: 'paused', clock_base_seconds: seconds, running_since: null })
  }

  // Start neste omgang — fortsett klokka og tell opp periode.
  async function startNextHalf(matchId) {
    await writeSession(matchId, {
      status: 'running',
      running_since: nowIso(),
      period: (session.value?.period || 1) + 1
    })
  }

  // Bytte: lukk utgående spillers stint, åpne ny for innbytter
  // (arver rolle OG formasjons-slot).
  async function substitute(matchId, { outPlayerId, inPlayerId }) {
    const clk = currentClock.value
    const out = openStintFor(matchId, outPlayerId)
    const role = out?.role || 'field'
    const position = out?.position || null
    if (out) await patchStint(out.id, { off_clock: clk })
    await insertStints([{ match_id: matchId, player_id: inPlayerId, role, position, on_clock: clk }])
  }

  // Bytt plass live: to utespillere bytter formasjons-slot. Posisjon brukes
  // aldri i statistikk (kun rolle + spilletid telles), så vi relabler bare
  // `position` på de to åpne stintene — klokke og spilletid røres ikke.
  async function swapFieldPositions(matchId, aPlayerId, bPlayerId) {
    if (aPlayerId === bPlayerId) return
    const a = openStintFor(matchId, aPlayerId)
    const b = openStintFor(matchId, bPlayerId)
    if (!a || !b) return
    const aPos = a.position
    const bPos = b.position
    await patchStint(a.id, { position: bPos })
    await patchStint(b.id, { position: aPos })
  }

  // Keeper-bytte: en spiller på banen og keeperen bytter rolle OG plass.
  // Modelleres som lukk + åpne for begge ved gjeldende klokke.
  async function swapKeeper(matchId, playerId) {
    const clk = currentClock.value
    const keeper = stints.value.find(
      s => s.match_id === matchId && s.role === 'keeper' && s.off_clock == null
    )
    const target = openStintFor(matchId, playerId)
    if (!target || keeper?.player_id === playerId) return

    if (keeper) {
      const keeperPos = keeper.position
      await patchStint(keeper.id, { off_clock: clk })
      await insertStints([{
        match_id: matchId, player_id: keeper.player_id,
        role: 'field', position: target.position, on_clock: clk
      }])
      await patchStint(target.id, { off_clock: clk })
      await insertStints([{
        match_id: matchId, player_id: playerId,
        role: 'keeper', position: keeperPos, on_clock: clk
      }])
    } else {
      // Ingen keeper på banen (kantcase) — bare gjør target til keeper.
      await patchStint(target.id, { off_clock: clk })
      await insertStints([{
        match_id: matchId, player_id: playerId,
        role: 'keeper', position: target.position, on_clock: clk
      }])
    }
  }

  // Avslutt: lukk alle åpne stints på gjeldende klokke, frys session.
  async function finishMatch(matchId) {
    const clk = currentClock.value
    const open = stints.value.filter(s => s.match_id === matchId && s.off_clock == null)
    for (const s of open) await patchStint(s.id, { off_clock: clk })
    await writeSession(matchId, {
      status: 'finished',
      clock_base_seconds: clk,
      running_since: null
    })
  }

  // Nullstill kampen helt — slett session + alle stints (start på nytt).
  async function resetMatch(matchId) {
    if (!isSupabaseConfigured) {
      stints.value = stints.value.filter(s => s.match_id !== matchId)
      if (session.value?.match_id === matchId) session.value = null
      return
    }
    // blindskriving: nullstiller en kamp. Er den aldri startet, finnes verken
    // perioder eller økt, og null rader er nøyaktig det svaret vi vil ha.
    await supabase.from('match_stints').delete().eq('match_id', matchId)
    // blindskriving: se linjen over.
    await supabase.from('match_sessions').delete().eq('match_id', matchId)
    stints.value = stints.value.filter(s => s.match_id !== matchId)
    if (session.value?.match_id === matchId) session.value = null
  }

  // ── Etterjustering ──────────────────────────────────────────────────────────
  // Bommer man på et bytte live, er kampen over før feilen oppdages. Da må tida
  // kunne flyttes i etterkant — men bare FLYTTES. Aldri «gi Julian fem
  // minutter»: noen må ha stått de fem minuttene, ellers var det seks mann på
  // banen. Regnestykket ligger i lib/timeTransfer.js; her skrives det bare ned.
  //
  // Returnerer handlingene som ble utført, slik at de kan angres nøyaktig —
  // ikke ved å flytte tilbake (som kunne landet i et annet vindu), men ved å
  // sette radene tilbake til det de var.
  async function adjustPlayingTime(matchId, fromId, toId, seconds) {
    const mine = stints.value.filter(s => s.match_id === matchId)
    const matchEnd = session.value?.clock_base_seconds || 0
    const plan = planTransfer({ stints: mine, fromId, toId, seconds, matchEnd })
    if (!plan.moved) return plan

    const done = []
    for (const op of plan.ops) {
      if (op.kind === 'update') {
        await patchStint(op.id, op.patch)
        done.push(op)
      } else if (op.kind === 'delete') {
        await deleteStint(op.id)
        done.push(op)
      } else {
        const [row] = await insertStints([op.row])
        done.push({ ...op, id: row?.id })
      }
    }
    return { ...plan, ops: done }
  }

  async function undoAdjustment(ops) {
    for (const op of [...ops].reverse()) {
      if (op.kind === 'update') await patchStint(op.id, op.before)
      else if (op.kind === 'insert') { if (op.id) await deleteStint(op.id) }
      else if (op.kind === 'delete') {
        const { id, ...row } = op.before
        await insertStints([row])
      }
    }
  }

  // Hvor mye som i det hele tatt lar seg flytte mellom to spillere — flata
  // bruker den til å gråe ut valg den ellers ville tilbudt og så feilet på.
  function movableSeconds(matchId, fromId, toId) {
    return transferableSeconds({
      stints: stints.value.filter(s => s.match_id === matchId),
      fromId, toId,
      matchEnd: session.value?.clock_base_seconds || 0
    })
  }

  // ── Avledet tilstand ─────────────────────────────────────────────────────────
  function matchStints(matchId) {
    return stints.value.filter(s => s.match_id === matchId)
  }

  function isOnField(playerId) {
    return !!openStintFor(session.value?.match_id, playerId)
  }

  function roleOf(playerId) {
    return openStintFor(session.value?.match_id, playerId)?.role || null
  }

  function positionOf(playerId) {
    return openStintFor(session.value?.match_id, playerId)?.position || null
  }

  // Spiller som står i en gitt formasjons-slot akkurat nå.
  function playerAtPosition(slotId) {
    const s = stints.value.find(
      x => x.match_id === session.value?.match_id && x.position === slotId && x.off_clock == null
    )
    return s?.player_id || null
  }

  // Spilletid for gjeldende kamp — åpne stints løper mot currentClock.
  const playingTimeByPlayer = computed(() => {
    const mid = session.value?.match_id
    const clk = currentClock.value
    const out = {}
    for (const s of stints.value) {
      if (mid && s.match_id !== mid) continue
      const end = s.off_clock != null ? s.off_clock : clk
      const dur = Math.max(0, end - s.on_clock)
      const e = out[s.player_id] || (out[s.player_id] = { fieldSec: 0, keeperSec: 0, totalSec: 0 })
      if (s.role === 'keeper') e.keeperSec += dur
      else e.fieldSec += dur
      e.totalSec += dur
    }
    return out
  })

  return {
    session, stints, currentClock, isRunning,
    startClockTick, stopClockTick,
    fetchSession, fetchStints, fetchAllStints,
    saveSetup, startMatch, pauseClock, resumeClock, endHalfAt, startNextHalf, substitute, swapKeeper, swapFieldPositions, finishMatch, resetMatch,
    matchStints, isOnField, roleOf, positionOf, playerAtPosition, playingTimeByPlayer,
    adjustPlayingTime, undoAdjustment, movableSeconds
  }
}
