<script setup>
// OPPMØTE OG KJØREPLAN — planen for økta er ferdig når oppmøtet er telt opp.
//
// Først «Hvem er her?»: hele kullet og alle trenerne er på, trykk bort dem som
// mangler, «Se kjøreplanen». Da lages fordelingen med Del inn-motoren
// (lib/grupper) og lagres sammen med oppmøtet (bare på selve treningsdagen):
//   Grupper — nivågrupper for diff-øvelsene, én gang per økt, samme trener
//             gjennom alle diff-øvelsene.
//   Lag     — trukket én gang for mix-øvelsene, nivåene spredt, to per bane.
//
// Kjøreplanen er én side. Er planen diff først og mix etterpå, står gruppene
// med sine øvelser og så lagene med sine; ellers gruppene og lagene øverst og
// øvelsene i planlagt rekkefølge. «Endre» åpner Del inn låst til planen, på
// egen side. Ark bare for én øvelse og for oppmøtet.
//
// Den som kommer for sent legges i gruppa for sitt nivå og på laget som gjør
// banene jevnest. Ingen andre flyttes. Den som går, tas bare ut.
//
// Andre dager enn treningsdagen vises kjøreplanen uten at noe lagres.
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTrainingWeek } from '../composables/useTrainingWeek'
import { useExercises, resolveDrills, EQUIPMENT_TAGS } from '../composables/useExercises'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerLevels } from '../composables/usePlayerLevels'
import { useCoaches } from '../composables/useCoaches'
import { useResponsibilities } from '../composables/useResponsibilities'
import { useTreningsOkt, datoFor, erTreningsdag } from '../composables/useTreningsOkt'
import { useAuth } from '../stores/auth'
import {
  lagGjenger, iGjengene, antallLag, trekkLag, baner, trenerePerBane, plasser,
  gjengNavn, lagFarge, kortnavn, ovelseNokkel, planFor, RIGGER_FRA
} from '../lib/grupper'
import { weekdayDateLabel } from '../lib/dateLabels'
import { meldEvent } from '../lib/sporing'
import OppmoteGrid from '../components/OppmoteGrid.vue'
import ExerciseView from '../components/ExerciseView.vue'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Steg from '../components/Steg.vue'
import OvelseRader from '../components/OvelseRader.vue'

const route = useRoute()
const router = useRouter()
const { isCoach, activeCohort, coach } = useAuth()
const { days, fetchWeek } = useTrainingWeek()
const { exercises, fetchExercises } = useExercises()
const { players, fetchPlayers } = usePlayers()
const { fetchPlayerLevels, levelFor } = usePlayerLevels()
const { coaches, fetchCoaches } = useCoaches()
const { fetchResponsibilities } = useResponsibilities()
const okt = useTreningsOkt()
const run = okt.run

const session = computed(() => days.value.find(s => s.id === route.params.id) || null)
const drills = computed(() => (session.value ? resolveDrills(session.value.drills, exercises.value) : []))
const datoTekst = computed(() => weekdayDateLabel(datoFor()).replace(/^\S+\s/, ''))
const treningsdag = computed(() => erTreningsdag(session.value))

const sortert = computed(() => [...players.value].sort((a, b) => a.name.localeCompare(b.name, 'no')))
const navn = computed(() => kortnavn(players.value))
const trenerNavn = computed(() => kortnavn(coaches.value))
// «Alex», «Alex og Iver», «Alex, Iver og Trond».
const navnPa = ids => {
  const n = ids.map(id => trenerNavn.value[id]).filter(Boolean)
  return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} og ${n[n.length - 1]}`
}

// ── Hvem er her? ────────────────────────────────────────────────────────────
//
// Før kjøreplanen er dette et utkast på telefonen: alle er på, du trykker
// bort. Etterpå skriver hvert trykk rett til økta (i oppmøte-arket).
const borteSpillere = ref(new Set())
const borteTrenere = ref(new Set())

function erHer(id) {
  return run.value ? run.value.spillere.includes(id) : !borteSpillere.value.has(id)
}
function trenerHer(id) {
  return run.value ? run.value.trenere.includes(id) : !borteTrenere.value.has(id)
}
const her = computed(() => players.value.filter(p => erHer(p.id)).map(p => ({ id: p.id, niva: levelFor(p.id) })))

// Rigger. Før lagring: den med rigg som ansvarsområde (ellers forrige økts
// rigger), hvis han er her og dere er mange
// nok (RIGGER_FRA). Treneren kan velge noen andre, eller ingen.
const standardRigger = ref(null)
const riggerValgt = ref(undefined) // undefined = la standarden gjelde
const rigger = computed(() => {
  if (run.value) {
    const r = run.value.state?._rigger || null
    return r && run.value.trenere.includes(r) ? r : null
  }
  if (riggerValgt.value !== undefined) return riggerValgt.value && trenerHer(riggerValgt.value) ? riggerValgt.value : null
  const s = standardRigger.value
  const antall = coaches.value.filter(c => trenerHer(c.id)).length
  return s && trenerHer(s) && antall >= RIGGER_FRA ? s : null
})
function velgRigger(id) {
  if (run.value) return okt.settInngrep('_rigger', id)
  riggerValgt.value = id
}
// Trenerne på gjengene og banene: alle som er her, unntatt riggeren.
const trenereIOkta = computed(() => coaches.value.filter(c => trenerHer(c.id) && c.id !== rigger.value).map(c => c.id))

// ── Fordelingen ─────────────────────────────────────────────────────────────
const harDiff = computed(() => drills.value.some(d => d.type === 'diff'))
const mixAntall = computed(() => [...new Set(kort.value.filter(k => k.d.type === 'mix').map(antallFor).filter(Boolean))])

// Antall grupper eller lag på én øvelse: det treneren har valgt i arket,
// ellers det øvelsen tilsier. Lagres på økta, så alle ser det samme.
const valgtAntall = computed(() => run.value?.state?._antall || {})
function antallFor(k) {
  const n = her.value.length
  const v = valgtAntall.value[ovelseNokkel(k.i, k.d)]
  if (k.d.type === 'mix') return v ? Math.min(v, n) : antallLag(k.d, n)
  if (k.d.type === 'diff') return v || planFor(k.d, n)?.grupper || null
  return null
}
function valgFor(k) {
  const n = her.value.length
  if (k.d.type === 'mix') return [2, 3, 4, 5, 6].filter(v => v * 2 <= n || v === 2)
  if (k.d.type === 'diff') return [1, 2, 3, 4, 5, 6].filter(v => v <= n)
  return []
}
// Nytt antall lag trekkes og lagres med en gang. Finnes det lag med det
// antallet fra før (en annen øvelse), brukes de.
function velgAntall(k, v) {
  if (!run.value || v === antallFor(k)) return
  if (k.d.type === 'mix' && !run.value.state?._lag?.[v]) {
    okt.settInngrep('_lag', { ...(run.value.state?._lag || {}), ...lagretLag.value, [v]: trekkLag(her.value, v, runde.value + 1) })
  }
  okt.settInngrep('_antall', { ...valgtAntall.value, [ovelseNokkel(k.i, k.d)]: v })
  meldEvent('okt_antall_valgt', { type: k.d.type, antall: v })
}

function lagPlan(runde) {
  const ut = {}
  if (harDiff.value) ut._gjenger = lagGjenger(her.value, trenereIOkta.value, runde, runde + 1)
  if (mixAntall.value.length) ut._lag = Object.fromEntries(mixAntall.value.map(n => [n, trekkLag(her.value, n, runde + 1)]))
  return ut
}

// «3 gjenger og 4 lag.» over knappen — det du får når du går videre.
const forhand = computed(() => {
  const deler = []
  if (harDiff.value) {
    const n = lagGjenger(her.value, trenereIOkta.value).length
    deler.push(`${n} ${n === 1 ? 'gruppe' : 'grupper'}`)
  }
  if (mixAntall.value.length) deler.push(`${mixAntall.value[0]} lag`)
  return deler.length ? `${deler.join(' og ')}.` : ''
})

const starter = ref(false)
async function start() {
  if (starter.value || !session.value) return
  starter.value = true
  const sp = players.value.filter(p => !borteSpillere.value.has(p.id)).map(p => p.id)
  const tr = coaches.value.filter(c => !borteTrenere.value.has(c.id)).map(c => c.id)
  await okt.start(session.value, sp, tr, rigger.value, lagPlan)
  meldEvent('okt_startet', { spillere: sp.length, trenere: tr.length, lagret: treningsdag.value })
  starter.value = false
  window.scrollTo({ top: 0 })
}

// Gjengene og lagene slik de står nå: det lagrede, med bare dem som er her.
// Er noen her uten plass (lagt til på en annen telefon før lagringen kom
// fram), får de plassen sin her også, så ingen forsvinner fra planen.
const runde = computed(() => run.value?.state?._runde || 0)
const tilStede = computed(() => new Set(run.value?.spillere || []))

const lagretGjenger = computed(() => {
  if (!run.value || !harDiff.value) return []
  return run.value.state?._gjenger || lagGjenger(her.value, trenereIOkta.value, runde.value, runde.value + 1)
})
function medPlass(grupper, fyll) {
  const plassert = new Set(grupper.flatMap(g => g.spillere))
  for (const s of her.value) if (!plassert.has(s.id)) fyll(grupper, s)
  return grupper
}
const gjenger = computed(() => {
  const g = lagretGjenger.value.map(x => ({
    ...x,
    spillere: x.spillere.filter(id => tilStede.value.has(id)),
    trenere: (x.trenere || []).filter(id => run.value.trenere.includes(id) && id !== rigger.value)
  }))
  return medPlass(g, (gr, s) => { const p = plasser(s.niva, gr, null); if (p.gjeng > -1) gr[p.gjeng].spillere.push(s.id) })
})

const lagretLag = computed(() => {
  if (!run.value) return {}
  const lagret = run.value.state?._lag || {}
  const ut = {}
  for (const n of mixAntall.value) ut[n] = lagret[n] || trekkLag(her.value, n, runde.value + 1)
  return ut
})
const lagSett = computed(() => Object.entries(lagretLag.value).map(([n, lag]) => {
  const l = medPlass(lag.map(ids => ({ spillere: ids.filter(id => tilStede.value.has(id)) })), (gr, s) => {
    const p = plasser(s.niva, [], gr.map(x => x.spillere))
    if (p.lag > -1) gr[p.lag].spillere.push(s.id)
  }).map(x => x.spillere)
  const b = baner(l)
  const tr = trenerePerBane(b.length, trenereIOkta.value, runde.value)
  return {
    n: Number(n),
    ovelser: kort.value.filter(k => k.d.type === 'mix' && antallFor(k) === Number(n)),
    lag: l,
    baner: b.map((bane, i) => ({ ...bane, trenere: tr[i], pluss: pluss(bane, l) }))
  }
}))
// Laget som er én færre på banen: en trener spiller med dem.
function pluss(bane, lag) {
  if (bane.lag.length < 2) return null
  const [a, b] = bane.lag
  if (Math.abs(lag[a].length - lag[b].length) !== 1) return null
  return lag[a].length < lag[b].length ? a : b
}

// ── Øvelsene, i planlagt rekkefølge ─────────────────────────────────────────
const utstyrNavn = Object.fromEntries(EQUIPMENT_TAGS.map(t => [t.value, t.label.toLowerCase()]))
const kort = computed(() => drills.value.map((d, i) => ({ d, i })))
function metaFor(k) {
  const deler = []
  if (k.d.minutes) deler.push(`${k.d.minutes} min`)
  if (k.d.type === 'diff') deler.push(iGjengene(k.d, gjenger.value, valgtAntall.value[ovelseNokkel(k.i, k.d)] || null))
  else if (k.d.type === 'mix') deler.push(`${antallFor(k)} lag`)
  else deler.push('alle sammen')
  const ting = (k.d.utstyr_tags || []).map(t => utstyrNavn[t]).filter(Boolean)
  if (ting.length) deler.push(ting.join(', '))
  return deler.join(' · ')
}
const diffNr = computed(() => kort.value.filter(k => k.d.type === 'diff').map(k => k.i + 1))
function gjelder(nr) {
  if (!nr.length) return ''
  if (nr.length === 1) return `Gjelder øvelse ${nr[0]}.`
  return `Gjelder øvelse ${nr.slice(0, -1).join(', ')} og ${nr[nr.length - 1]}.`
}

// ── Øvelsen (ark) ───────────────────────────────────────────────────────────
const apen = ref(null)
const aktiv = computed(() => (apen.value == null ? null : kort.value[apen.value] || null))
async function bla(d) {
  const j = apen.value + d
  if (j < 0 || j >= kort.value.length) return
  apen.value = j
  await nextTick()
  document.querySelectorAll('.ds-sheet__body').forEach(el => el.scrollTo({ top: 0 }))
}
function apne(i) {
  apen.value = i
  meldEvent('okt_ovelse_apnet')
}

// ── Oppmøtet under økta (ark): kom for sent, gikk tidlig ────────────────────
const visOppmote = ref(false)
const sistInn = ref(null) // { id, navn, tekst }
watch(visOppmote, v => { if (v) sistInn.value = null })

const NOYTRUM = { Gul: 'gult', Rød: 'rødt', Blå: 'blått', Grønn: 'grønt', Oransje: 'oransje', Hvit: 'hvitt' }

function vekslSpiller(id) {
  if (!run.value) {
    const s = new Set(borteSpillere.value)
    s.has(id) ? s.delete(id) : s.add(id)
    borteSpillere.value = s
    return
  }
  if (erHer(id)) {
    okt.settSpiller(id, false)
    if (sistInn.value?.id === id) sistInn.value = null
    return
  }
  kommer(id)
}

// Den som kommer: inn i gjengen for sitt nivå og på laget som gjør banene
// jevnest. Var spilleren her før og gikk, står plassen fortsatt lagret.
function kommer(id) {
  const niva = levelFor(id)
  const nyGjenger = lagretGjenger.value.map(g => ({ ...g, spillere: [...g.spillere] }))
  const nyLag = Object.fromEntries(Object.entries(lagretLag.value).map(([n, l]) => [n, l.map(x => [...x])]))
  const deler = []
  let baneTekst = ''

  if (harDiff.value && gjenger.value.length) {
    let g = gjenger.value.find(x => lagretGjenger.value.find(y => y.id === x.id)?.spillere.includes(id))
    if (!g) {
      const p = plasser(niva, gjenger.value, null)
      g = gjenger.value[p.gjeng]
      nyGjenger.find(x => x.id === g.id)?.spillere.push(id)
    }
    const n = g.nivaer
    const gruppa = !n.length ? 'Gruppa' : `${n.length > 1 ? `${n.slice(0, -1).join('-, ')}- og ${n[n.length - 1]}` : n[0]}-gruppa`
    deler.push(`${gruppa}${g.trenere.length ? ` hos ${navnPa(g.trenere)}` : ''}`)
  }
  lagSett.value.forEach((sett, si) => {
    let i = nyLag[sett.n].findIndex(l => l.includes(id))
    if (i < 0) {
      i = plasser(niva, [], sett.lag).lag
      if (i > -1) nyLag[sett.n][i].push(id)
    }
    if (i < 0 || si > 0) return
    deler.push(`${NOYTRUM[lagFarge(i)] || lagFarge(i).toLowerCase()} lag`)
    const b = sett.baner.findIndex(x => x.lag.includes(i))
    const bane = sett.baner[b]
    if (bane?.lag.length === 2) {
      const str = bane.lag.map(j => sett.lag[j].length + (j === i ? 1 : 0))
      baneTekst = ` Bane ${b + 1} blir ${str[0]} mot ${str[1]}.`
    }
  })

  okt.settSpiller(id, true)
  if (harDiff.value) okt.settInngrep('_gjenger', nyGjenger)
  if (lagSett.value.length) okt.settInngrep('_lag', nyLag)
  sistInn.value = { id, navn: navn.value[id], tekst: deler.length ? `${deler.join(', og ')}.${baneTekst}` : '' }
  meldEvent('okt_kom_for_sent')
}
function vekslTrener(id) {
  if (run.value) return okt.settTrener(id, !trenerHer(id))
  const s = new Set(borteTrenere.value)
  s.has(id) ? s.delete(id) : s.add(id)
  borteTrenere.value = s
}

// ── Endre: Del inn, låst til planen ─────────────────────────────────────────
//
// Egen side (/endre/grupper eller /endre/lag/:n). Antallet med − og +, et
// trykk på et navn flytter én spiller. Alt skrives rett til økta, hos alle.
const paEndre = computed(() => route.name === 'okt-endre')
const endre = computed(() => {
  if (!paEndre.value) return null
  if (route.params.hva === 'lag') return { hva: 'lag', n: Number(route.params.n) || lagSett.value[0]?.n || 0 }
  return { hva: 'gjenger' }
})
const valgt = ref(null)
watch(() => route.fullPath, () => { valgt.value = null })
// Uten oppmøte er det ingenting å endre: tilbake til opptellingen.
watch([paEndre, () => okt.lastet.value, run], ([pa, lastet, r]) => {
  if (pa && lastet && session.value && !r) router.replace(`/trening/okt/${session.value.id}`)
}, { immediate: true })

// «Endret 17:50 av Alex» under overskriften.
function merkEndret(hva) {
  const st = run.value?.state || {}
  okt.settInngrep('_endret', { ...(st._endret || {}), [hva]: { tid: new Date().toISOString(), av: coach.value?.id || null, navn: coach.value?.name || null } })
}
function endretTekst(hva) {
  const e = run.value?.state?._endret?.[hva]
  if (!e?.tid) return ''
  const t = new Date(e.tid)
  const kl = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
  const hvem = (e.av && trenerNavn.value[e.av]) || (e.navn ? String(e.navn).split(/\s+/)[0] : '')
  return `Endret ${kl}${hvem ? ` av ${hvem}` : ''}`
}

// Antallet. Gruppene lages på nytt med samme motor; lagene trekkes.
const endreAntall = computed(() => {
  if (!endre.value) return 0
  return endre.value.hva === 'gjenger' ? gjenger.value.length : endre.value.n
})
const endreMaks = computed(() => {
  const n = her.value.length
  return endre.value?.hva === 'lag' ? Math.max(2, Math.min(6, Math.floor(n / 2))) : Math.max(1, Math.min(6, n))
})
function settEndreAntall(v) {
  if (!run.value || !endre.value) return
  if (endre.value.hva === 'gjenger') {
    const standard = lagGjenger(her.value, trenereIOkta.value).length
    okt.settInngrep('_gjenger', lagGjenger(her.value, trenereIOkta.value, runde.value, runde.value + 1, v === standard ? null : v))
    merkEndret('grupper')
  } else {
    const sett = lagSett.value.find(x => x.n === endre.value.n)
    if (!run.value.state?._lag?.[v]) okt.settInngrep('_lag', { ...(run.value.state?._lag || {}), ...lagretLag.value, [v]: trekkLag(her.value, v, runde.value + 1) })
    const antall = { ...valgtAntall.value }
    for (const k of sett?.ovelser || []) antall[ovelseNokkel(k.i, k.d)] = v
    okt.settInngrep('_antall', antall)
    merkEndret('lag')
    router.replace(`/trening/okt/${session.value.id}/endre/lag/${v}`)
  }
  meldEvent('okt_antall_valgt', { type: endre.value.hva, antall: v })
}
function trekkPaNytt() {
  if (!run.value || endre.value?.hva !== 'lag') return
  const n = endre.value.n
  okt.settInngrep('_lag', { ...lagretLag.value, [n]: trekkLag(her.value, n, Math.floor(Math.random() * 1e9) + 1) })
  merkEndret('lag')
  meldEvent('okt_trukket')
}
const endreInfo = computed(() => {
  if (endre.value?.hva !== 'lag') return ''
  const sett = lagSett.value.find(x => x.n === endre.value.n)
  if (!sett) return ''
  const str = sett.lag.map(l => l.length)
  const lo = Math.min(...str), hi = Math.max(...str)
  return `${sett.baner.length} ${sett.baner.length === 1 ? 'bane' : 'baner'}, ${lo === hi ? lo : `${lo}–${hi}`} på hvert lag`
})

const endreGrupper = computed(() => {
  if (!endre.value) return []
  if (endre.value.hva === 'gjenger') {
    return gjenger.value.map(g => ({ key: g.id, merke: g.nivaer.join(''), tittel: navnPa(g.trenere), spillere: g.spillere, nivaer: g.nivaer }))
  }
  const sett = lagSett.value.find(s => s.n === endre.value.n)
  return (sett?.lag || []).map((l, i) => ({ key: i, merke: null, tittel: lagFarge(i), spillere: l }))
})
const endreGjelder = computed(() => {
  if (!endre.value) return ''
  const nr = endre.value.hva === 'gjenger' ? diffNr.value : (lagSett.value.find(s => s.n === endre.value.n)?.ovelser || []).map(k => k.i + 1)
  return gjelder(nr).replace(/\.$/, '')
})
// Gjengene: bare nabonivåer, aldri A inn hos C eller omvendt.
const flyttTil = computed(() => {
  if (!valgt.value) return []
  const fra = endreGrupper.value.find(g => g.spillere.includes(valgt.value))
  return endreGrupper.value.filter(g => {
    if (g === fra) return false
    if (endre.value.hva !== 'gjenger') return true
    const n = levelFor(valgt.value) || 'B'
    return !((n === 'A' && g.nivaer.includes('C')) || (n === 'C' && g.nivaer.includes('A')))
  })
})
function flytt(til) {
  const id = valgt.value
  if (!id) return
  if (endre.value.hva === 'gjenger') {
    const ny = lagretGjenger.value.map(g => ({ ...g, spillere: g.spillere.filter(x => x !== id) }))
    ny.find(g => g.id === til.key)?.spillere.push(id)
    okt.settInngrep('_gjenger', ny)
  } else {
    const n = endre.value.n
    const ny = { ...lagretLag.value, [n]: lagretLag.value[n].map(l => l.filter(x => x !== id)) }
    ny[n][til.key].push(id)
    okt.settInngrep('_lag', ny)
  }
  merkEndret(endre.value.hva === 'gjenger' ? 'grupper' : 'lag')
  meldEvent('okt_flyttet', { hva: endre.value.hva })
  valgt.value = null
}
function ikkeHer() {
  if (!valgt.value) return
  okt.settSpiller(valgt.value, false)
  valgt.value = null
}

// ── Nullstill ───────────────────────────────────────────────────────────────
const visSlett = ref(false)
async function slett() {
  visSlett.value = false
  await okt.slett()
  borteSpillere.value = new Set()
  borteTrenere.value = new Set()
  riggerValgt.value = undefined
  meldEvent('okt_nullstilt')
  window.scrollTo({ top: 0 })
}

let stopp = null
watch(session, s => {
  if (s && !stopp) stopp = okt.folg(s)
}, { immediate: true })

onMounted(async () => {
  fetchWeek()
  fetchExercises()
  fetchPlayers()
  fetchPlayerLevels()
  // Standard rigger: den som har rigg som ansvarsområde i trenerteamet
  // (Admin → Ansvarsområder). Uten det: den som rigget sist.
  const [liste, sist] = await Promise.all([fetchCoaches(), okt.sisteRigger()])
  const ansvar = activeCohort.value?.id ? await fetchResponsibilities(activeCohort.value.id, liste || []) : []
  standardRigger.value = (ansvar || []).find(r => /rigg/i.test(r.area))?.coach_id || sist
})
onUnmounted(() => {
  stopp?.()
})

// Fra Endre: tilbake til kjøreplanen. Fra kjøreplanen: Trening-fanen.
// Fra opptellingen: dit du kom fra.
function tilbake() {
  if (paEndre.value && session.value) return router.push(`/trening/okt/${session.value.id}`)
  if (run.value) return router.push('/trening')
  if (window.history.state?.back) return router.back()
  router.push(session.value ? `/trening/dag/${session.value.id}` : '/trening')
}
function tilEndre(hva, n) {
  router.push(`/trening/okt/${session.value.id}/endre/${hva}${n ? `/${n}` : ''}`)
}

// Kjøreplanen i to deler når planen er diff først og mix etterpå (det
// vanlige): gruppene med sine øvelser, så lagene med sine. Blander planen,
// står gruppene og lagene øverst og øvelsene i planlagt rekkefølge under.
const delt = computed(() => {
  const forsteMix = kort.value.findIndex(k => k.d.type === 'mix')
  if (forsteMix < 0 || lagSett.value.length !== 1) return null
  if (kort.value.slice(forsteMix).some(k => k.d.type === 'diff')) return null
  return { grupper: kort.value.slice(0, forsteMix), lag: kort.value.slice(forsteMix) }
})

// Fra Del inn («Bruk som dagens …») med #grupper eller #lag: rull dit når
// planen står.
watch([() => route.hash, () => !!run.value, () => drills.value.length], async ([h, harRun, n]) => {
  if (!h || !harRun || !n || paEndre.value) return
  await nextTick()
  document.querySelector(h)?.scrollIntoView({ block: 'start' })
}, { immediate: true })
</script>

<template>
  <div class="okt">
    <header class="okt__bar">
      <button class="okt__back" aria-label="Tilbake" @click="tilbake">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <template v-if="paEndre">
        <span class="okt__title">{{ endre?.hva === 'lag' ? 'Lag' : 'Grupper' }}</span>
        <span class="okt__tag">{{ endre?.hva === 'lag' ? 'Mix' : 'Diff' }}</span>
        <button v-if="run" type="button" class="okt__antall" @click="visOppmote = true">
          <strong>{{ her.length }}</strong> · <strong>{{ trenereIOkta.length }}</strong> {{ trenereIOkta.length === 1 ? 'trener' : 'trenere' }}
        </button>
      </template>
      <template v-else>
        <span class="okt__title">{{ session?.title || 'Trening' }}<span class="okt__dato"> {{ datoTekst }}</span></span>
        <button v-if="run" type="button" class="okt__her" @click="visOppmote = true">
          <strong>{{ her.length }}</strong> her
        </button>
      </template>
    </header>

    <p v-if="!isCoach" class="okt__tom">Kjøreplanen er for trenerne.</p>
    <p v-else-if="!session || !okt.lastet.value" class="okt__tom">Laster …</p>

    <p v-else-if="paEndre && !run" class="okt__tom">Laster …</p>

    <!-- ── ENDRE: Del inn, låst til planen ─────────────────────── -->
    <div v-else-if="paEndre" class="endre">
      <div class="endre__styr">
        <span class="endre__gjelder">{{ endreGjelder }}</span>
        <Steg
          :verdi="endreAntall" :min="endre.hva === 'lag' ? 2 : 1" :maks="endreMaks"
          :navn="endre.hva === 'lag' ? 'Antall lag' : 'Antall grupper'"
          @endre="settEndreAntall"
        />
      </div>
      <div v-if="endre.hva === 'lag'" class="endre__info">
        <span>{{ endreInfo }}</span>
        <button type="button" class="endre__trekk" @click="trekkPaNytt">Trekk på nytt</button>
      </div>
      <p class="endre__hint">Trykk et navn for å flytte.</p>
      <div v-for="g in endreGrupper" :key="g.key" class="endre-gr">
        <div class="gjeng__hode">
          <span v-if="g.merke" class="gjeng__niva">{{ g.merke }}</span>
          <span class="gjeng__trener">{{ g.tittel || 'Ingen trener' }}</span>
          <span class="gjeng__ant">{{ g.spillere.length }}</span>
        </div>
        <div class="brikker">
          <button
            v-for="id in g.spillere"
            :key="id"
            type="button"
            class="brikke"
            :class="{ 'brikke--valgt': valgt === id }"
            :aria-pressed="valgt === id ? 'true' : 'false'"
            @click="valgt = valgt === id ? null : id"
          >{{ navn[id] }}</button>
        </div>
      </div>

      <div class="oppm__fot">
        <div v-if="valgt" class="oppm__fot-inn fot--kolonne fot">
          <p class="fot__hint">Flytt <strong>{{ navn[valgt] }}</strong> til</p>
          <div class="mal">
            <button v-for="g in flyttTil" :key="g.key" type="button" class="mal__knapp" @click="flytt(g)">
              <span v-if="g.merke" class="gjeng__niva gjeng__niva--liten">{{ g.merke }}</span>
              {{ g.tittel || g.merke }}
            </button>
          </div>
          <button type="button" class="fot__tekst" @click="ikkeHer">{{ navn[valgt] }} er ikke her</button>
        </div>
        <div v-else class="oppm__fot-inn">
          <button type="button" class="okt__start" @click="tilbake">Ferdig</button>
        </div>
      </div>
    </div>

    <!-- ── D1 HVEM ER HER? ──────────────────────────────────────── -->
    <div v-else-if="!run" class="oppm">
      <h1 class="okt__h1">Hvem er her?</h1>
      <p class="oppm__under">Trykk bort dem som mangler.</p>
      <p class="oppm__teller"><strong>{{ her.length }}</strong> av {{ players.length }} spillere</p>

      <OppmoteGrid
        :spillere="sortert"
        :trenere="coaches"
        :navn="navn"
        :trener-navn="trenerNavn"
        :er-her="erHer"
        :trener-her="trenerHer"
        :rigger="rigger"
        @spiller="vekslSpiller"
        @trener="vekslTrener"
        @rigger="velgRigger"
      />

      <div class="oppm__fot">
        <div class="oppm__fot-inn">
          <p class="oppm__linje">
            <strong v-if="forhand">{{ forhand }}</strong>
            {{ treningsdag ? 'Oppmøtet lagres når du går videre.' : 'Ikke treningsdag, så oppmøtet lagres ikke.' }}
          </p>
          <button type="button" class="okt__start" :disabled="!her.length || starter" @click="start">
            Se kjøreplanen
          </button>
        </div>
      </div>
    </div>

    <!-- ── D2 KJØREPLANEN ───────────────────────────────────────── -->
    <div v-else class="plan">
      <p v-if="run.lokal" class="plan__lokal">Ikke treningsdag. Ingenting er lagret.</p>

      <section v-if="gjenger.length" id="grupper" class="fase">
        <div class="fase__hode">
          <h2 class="fase__tittel">Grupper</h2>
          <span class="fase__tag">Diff</span>
          <button type="button" class="fase__endre" @click="tilEndre('grupper')">Endre</button>
        </div>
        <p v-if="endretTekst('grupper')" class="fase__endret">{{ endretTekst('grupper') }}</p>
        <div class="kortene">
          <div v-for="g in gjenger" :key="g.id" class="gjeng">
            <div class="gjeng__hode">
              <span v-if="g.nivaer.length" class="gjeng__niva" :aria-label="`Nivå ${gjengNavn(g)}`">{{ g.nivaer.join('') }}</span>
              <span class="gjeng__trener">{{ navnPa(g.trenere) || 'Ingen trener' }}</span>
              <span class="gjeng__ant">{{ g.spillere.length }}</span>
            </div>
            <p class="gjeng__navn">{{ g.spillere.map(id => navn[id]).join(' · ') }}</p>
          </div>
        </div>
        <OvelseRader v-if="delt && delt.grupper.length" class="fase__ovelser" :kort="delt.grupper" :meta="metaFor" @apne="apne" />
      </section>
      <section v-else-if="delt && delt.grupper.length" class="fase">
        <h2 class="fase__tittel fase__tittel--alene">Øvelsene</h2>
        <OvelseRader :kort="delt.grupper" :meta="metaFor" @apne="apne" />
      </section>

      <section v-for="(sett, si) in lagSett" :id="si === 0 ? 'lag' : undefined" :key="sett.n" class="fase">
        <div class="fase__hode">
          <h2 class="fase__tittel">Lag</h2>
          <span class="fase__tag">Mix</span>
          <button type="button" class="fase__endre" @click="tilEndre('lag', sett.n)">Endre</button>
        </div>
        <p v-if="endretTekst('lag')" class="fase__endret">{{ endretTekst('lag') }}</p>
        <p v-if="lagSett.length > 1" class="fase__til">Til {{ sett.ovelser.map(k => k.d.text).join(', ') }}</p>
        <OvelseRader v-if="delt" class="fase__ovelser fase__ovelser--forst" :kort="delt.lag" :meta="metaFor" @apne="apne" />
        <div v-for="(b, bi) in sett.baner" :key="bi" class="bane">
          <p class="bane__hode">
            <strong>Bane {{ bi + 1 }}</strong>
            <span v-if="b.trenere.length">{{ navnPa(b.trenere) }}</span>
          </p>
          <div class="kortene">
            <div v-for="li in b.lag" :key="li" class="gjeng">
              <div class="gjeng__hode">
                <span class="gjeng__trener">{{ lagFarge(li) }}</span>
                <span v-if="b.pluss === li" class="gjeng__pluss">+ trener</span>
                <span class="gjeng__ant">{{ sett.lag[li].length }}</span>
              </div>
              <p class="gjeng__navn">{{ sett.lag[li].map(id => navn[id]).join(' · ') }}</p>
            </div>
          </div>
        </div>
      </section>

      <section v-if="!delt" class="fase">
        <h2 class="fase__tittel fase__tittel--alene">Øvelsene</h2>
        <OvelseRader :kort="kort" :meta="metaFor" @apne="apne" />
      </section>

      <button type="button" class="okt__slett" @click="visSlett = true">{{ run.lokal ? 'Tell på nytt' : 'Nullstill oppmøtet' }}</button>
    </div>

    <!-- ── D3 ØVELSEN ──────────────────────────────────────────── -->
    <Sheet :show="!!aktiv" :title="aktiv?.d.text || ''" tall @close="apen = null">
      <template v-if="aktiv">
        <p class="ark__nr">Øvelse {{ aktiv.i + 1 }} av {{ kort.length }}</p>
        <p class="ark__meta">{{ metaFor(aktiv) }}</p>
        <div v-if="valgFor(aktiv).length" class="antall">
          <span class="antall__navn">{{ aktiv.d.type === 'mix' ? 'Lag' : 'Grupper' }}</span>
          <div class="antall__valg" role="group" :aria-label="aktiv.d.type === 'mix' ? 'Antall lag' : 'Antall grupper'">
            <button
              v-for="v in valgFor(aktiv)" :key="v" type="button" class="antall__knapp"
              :class="{ 'antall__knapp--valgt': v === antallFor(aktiv) }" :aria-pressed="v === antallFor(aktiv)"
              @click="velgAntall(aktiv, v)"
            >{{ v }}</button>
          </div>
        </div>
        <ExerciseView :exercise="aktiv.d" :minutes="aktiv.d.minutes || 0" />
      </template>
      <template #footer>
        <div v-if="aktiv" class="fot">
          <button type="button" class="fot__pil" :disabled="apen === 0" aria-label="Forrige øvelse" @click="bla(-1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button type="button" class="fot__knapp" @click="apen = null">Lukk</button>
          <button type="button" class="fot__pil" :disabled="apen === kort.length - 1" aria-label="Neste øvelse" @click="bla(1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </template>
    </Sheet>

    <!-- ── D4 HVEM ER HER? (under økta) ────────────────────────── -->
    <Sheet :show="visOppmote" title="Hvem er her?" tall @close="visOppmote = false">
      <p class="oppm__teller oppm__teller--ark"><strong>{{ her.length }}</strong> av {{ players.length }}</p>
      <OppmoteGrid
        :spillere="sortert"
        :trenere="coaches"
        :navn="navn"
        :trener-navn="trenerNavn"
        :er-her="erHer"
        :trener-her="trenerHer"
        :rigger="rigger"
        @spiller="vekslSpiller"
        @trener="vekslTrener"
        @rigger="velgRigger"
      />
      <template #footer>
        <div class="fot fot--kolonne">
          <div v-if="sistInn" class="inn" role="status">
            <strong>{{ sistInn.navn }} er med</strong>
            <span v-if="sistInn.tekst">{{ sistInn.tekst }}</span>
          </div>
          <button type="button" class="fot__knapp fot__knapp--hoved fot__knapp--bred" @click="visOppmote = false">Ferdig</button>
        </div>
      </template>
    </Sheet>

    <ConfirmDialog
      :show="visSlett"
      :title="run?.lokal ? 'Tell på nytt?' : 'Nullstill oppmøtet?'"
      :message="run?.lokal ? 'Kjøreplanen forsvinner, og du teller opp igjen.' : 'Dagens oppmøte slettes og teller ikke i statistikken.'"
      :confirm-label="run?.lokal ? 'Tell på nytt' : 'Nullstill'"
      variant="warning"
      @confirm="slett"
      @cancel="visSlett = false"
    />
  </div>
</template>

<style scoped>
.okt {
  min-height: 100vh;
  background: var(--ds-color-bg);
  padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
}

.okt__bar {
  display: flex; align-items: center; gap: var(--ds-space-sm);
  padding: var(--ds-space-md) var(--ds-space-lg);
  position: sticky; top: 0; z-index: var(--ds-z-sticky);
  background: var(--ds-color-bg);
  border-bottom: 1px solid var(--ds-color-border-light, var(--ds-color-border));
}
.okt__back {
  display: grid; place-items: center; width: 44px; height: 44px; margin-left: -12px;
  border: none; border-radius: var(--ds-radius-md); background: transparent;
  color: var(--ds-color-text-secondary); cursor: pointer;
}
.okt__back svg { width: 22px; height: 22px; }
.okt__title {
  min-width: 0;
  font-weight: var(--ds-weight-semibold);
  font-size: var(--ds-text-md);
  color: var(--ds-color-text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.okt__dato { margin-left: 6px; font-weight: var(--ds-weight-medium); color: var(--ds-color-text-tertiary); }
.okt__her {
  margin-left: auto; flex: none;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
}
.okt__her strong { color: var(--ds-color-text-primary); font-variant-numeric: tabular-nums; }

.okt__tom { padding: var(--ds-space-xl) var(--ds-space-lg); text-align: center; color: var(--ds-color-text-tertiary); }

.okt__h1 {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-2xl);
  font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
  margin: 0;
}

/* ── D1 Hvem er her? ── */
.oppm { max-width: 560px; margin: 0 auto; padding: var(--ds-space-xl) var(--ds-space-lg) 180px; }
.oppm__under { margin: 6px 0 0; font-size: var(--ds-text-md); color: var(--ds-color-text-secondary); }
.oppm__teller {
  margin: var(--ds-space-xl) 0 var(--ds-space-lg);
  font-size: var(--ds-text-md); color: var(--ds-color-text-secondary);
  font-variant-numeric: tabular-nums;
}
.oppm__teller strong {
  margin-right: 8px;
  font-size: 48px; line-height: 1; letter-spacing: -0.02em;
  font-weight: var(--ds-weight-bold); color: var(--ds-color-text-primary);
}
.oppm__teller--ark { margin: 0 0 var(--ds-space-lg); }
.oppm__teller--ark strong { font-size: var(--ds-text-xl); margin-right: 4px; }

/* Fast over bunnmenyen, ikke sticky: en sticky knapp følger innholdet når
   du scroller til bunnen av navnelista, og da hopper den. */
.oppm__fot {
  position: fixed;
  left: 0; right: 0;
  bottom: calc(65px + env(safe-area-inset-bottom, 0px));
  z-index: calc(var(--ds-z-sticky) - 1);
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: var(--ds-color-bg);
  border-top: 1px solid var(--ds-color-border-light, var(--ds-color-border));
}
.oppm__fot-inn { max-width: 560px; margin: 0 auto; }
@media (min-width: 768px) {
  .oppm__fot { bottom: 0; }
}
.oppm__linje {
  margin: 0 0 var(--ds-space-md);
  font-size: var(--ds-text-sm); line-height: 1.4;
  color: var(--ds-color-text-secondary);
  text-align: center;
}
.oppm__linje strong { color: var(--ds-color-text-primary); font-weight: var(--ds-weight-semibold); }
.okt__start {
  display: block; width: 100%;
  min-height: var(--ds-btn-h-lg); border: none; border-radius: var(--ds-radius-lg);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  font-family: var(--ds-font-body); font-size: var(--ds-text-lg); font-weight: var(--ds-weight-bold);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
}
.okt__start:disabled { opacity: .45; cursor: default; }

/* ── D2 Kjøreplanen ── */
.plan { max-width: 560px; margin: 0 auto; padding: var(--ds-space-lg) 0 0; }
.plan__lokal {
  margin: 0 var(--ds-space-lg) var(--ds-space-sm);
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
}

.fase { padding: var(--ds-space-lg) var(--ds-space-lg) var(--ds-space-xl); }
.fase + .fase { border-top: 1px solid var(--ds-color-border-light, var(--ds-color-border)); padding-top: var(--ds-space-xl); }
.fase__hode { display: flex; align-items: center; gap: var(--ds-space-md); margin-bottom: var(--ds-space-md); }
.fase__tittel {
  margin: 0;
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-xl);
  font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
  letter-spacing: -0.01em;
}
.fase__tittel--alene { margin-bottom: var(--ds-space-sm); }
.fase { scroll-margin-top: 72px; }
.fase__tag, .okt__tag {
  flex: none; display: inline-flex; align-items: center;
  height: 28px; padding: 0 12px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-badge-bg, var(--ds-color-bg-subtle));
  color: var(--ds-badge-text, var(--ds-color-text-primary));
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold);
}
.fase__endret { margin: -4px 0 var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.fase__ovelser { margin-top: var(--ds-space-sm); }
.fase__ovelser--forst { margin: -8px 0 var(--ds-space-md); }
.gjeng__pluss {
  flex: none; padding: 2px 10px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-xs, 12px); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

/* ── Endre ── */
.endre { max-width: 560px; margin: 0 auto; padding: 0 var(--ds-space-lg) 300px; }
.endre__styr {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  margin: 0 calc(-1 * var(--ds-space-lg));
  padding: var(--ds-space-sm) var(--ds-space-lg) var(--ds-space-md);
  border-bottom: 1px solid var(--ds-color-border-light, var(--ds-color-border));
}
.endre__gjelder { font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.endre__info {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  min-height: 44px; padding-top: var(--ds-space-sm);
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
}
.endre__trekk {
  flex: none; min-height: 44px; padding: 0 4px;
  border: 0; background: none;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  text-decoration: underline; text-underline-offset: 3px;
  cursor: pointer;
}
.endre__hint { margin: var(--ds-space-md) 0 var(--ds-space-lg); font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.okt__antall {
  margin-left: auto; flex: none;
  min-height: 44px; padding: 0 4px;
  border: 0; background: none;
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
  cursor: pointer;
}
.okt__antall strong { color: var(--ds-color-text-primary); font-variant-numeric: tabular-nums; }
.fase__til { margin: -4px 0 var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.fase__endre {
  margin-left: auto; flex: none;
  min-height: 44px; padding: 0 16px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}

.kortene { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
.gjeng {
  padding: var(--ds-space-md) var(--ds-space-lg);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-subtle, var(--ds-color-bg-elevated));
}
.gjeng__hode { display: flex; align-items: center; gap: var(--ds-space-md); }
.gjeng__niva {
  flex: none;
  display: grid; place-items: center;
  min-width: 32px; height: 28px; padding: 0 8px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  font-size: var(--ds-text-xs, 12px); font-weight: var(--ds-weight-bold);
}
.gjeng__niva--liten { min-width: 26px; height: 22px; padding: 0 6px; }
.gjeng__trener { min-width: 0; font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.gjeng__ant { margin-left: auto; flex: none; font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); font-variant-numeric: tabular-nums; }
.gjeng__navn { margin: var(--ds-space-sm) 0 0; font-size: var(--ds-text-md); line-height: 1.6; color: var(--ds-color-text-primary); }

.bane + .bane { margin-top: var(--ds-space-lg); }
.bane__hode {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px;
  margin: 0 0 var(--ds-space-sm);
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
}
.bane__hode strong { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }

.okt__slett {
  display: block;
  margin: var(--ds-space-xl) auto 0;
  min-height: 44px;
  border: 0; background: none; padding: 0 16px;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-error, var(--ds-color-text-secondary));
  cursor: pointer;
}

/* ── Arkene ── */
.ark__nr { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.ark__meta { margin: 4px 0 var(--ds-space-lg); font-size: var(--ds-text-sm); line-height: 1.4; color: var(--ds-color-text-secondary); }
.antall { display: flex; align-items: center; gap: 12px; margin: calc(-1 * var(--ds-space-sm)) 0 var(--ds-space-lg); }
.antall__navn { flex: none; min-width: 64px; font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.antall__valg { flex: 1; display: flex; gap: 6px; min-width: 0; }
.antall__knapp {
  flex: 1 1 0; min-width: 0; min-height: 44px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md, 10px);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
}
.antall__knapp--valgt { border-color: var(--ds-color-accent); background: var(--ds-color-accent); color: var(--ds-color-accent-text); }

.inn {
  display: flex; flex-direction: column; gap: 2px;
  padding: 14px 18px;
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-subtle, var(--ds-color-bg-elevated));
  font-size: var(--ds-text-sm); line-height: 1.45;
  color: var(--ds-color-text-secondary);
}
.inn strong { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }

.endre-gr + .endre-gr { margin-top: var(--ds-space-xl); }
.endre-gr .gjeng__hode { margin-bottom: 10px; }
.brikker { display: flex; flex-wrap: wrap; gap: 8px; }
.brikke {
  min-height: 44px; padding: 0 14px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.brikke--valgt { border-color: var(--ds-color-accent); background: var(--ds-color-accent); color: var(--ds-color-accent-text); }

.fot { display: flex; align-items: center; gap: var(--ds-space-sm); min-height: 48px; }
.fot--kolonne { flex-direction: column; align-items: stretch; }
.fot__pil {
  flex: none;
  display: grid; place-items: center;
  width: 52px; height: 52px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}
.fot__pil svg { width: 20px; height: 20px; }
.fot__pil:disabled { color: var(--ds-color-text-tertiary); opacity: .5; cursor: default; }
.fot__knapp {
  flex: 1 1 0;
  min-height: var(--ds-btn-h-lg);
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-subtle, var(--ds-color-bg-elevated));
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}
.fot__knapp--hoved { background: var(--ds-color-accent); color: var(--ds-color-accent-text); }
.fot__knapp--bred { width: 100%; flex: none; }
.fot__hint { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary); }
.fot__hint strong { color: var(--ds-color-text-primary); }
.fot__tekst {
  min-height: 44px; border: 0; background: none;
  font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
}
.mal { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.mal__knapp {
  flex: 1 1 120px;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  min-height: 52px; padding: 0 12px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  cursor: pointer;
}
</style>
