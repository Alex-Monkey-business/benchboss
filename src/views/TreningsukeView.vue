<script setup>
import { varighet } from '../lib/varighet'
import Ikon from '../components/Ikon.vue'
import Spot from '../components/Spot.vue'
import { useContent } from '../composables/useContent'
// TRENINGSUKA — uka på én side, én dag åpen.
//
// Først var dette tre nivåer du navigerte ned i: måned → dag → øvelse. Det
// gjorde sammenhengen usynlig — du så aldri dagen, fokuset og øvelsene samtidig.
// Så la vi alt på én side, og da ble det motsatte problemet: tre fulle dager
// samtidig er en vegg, ikke en plan.
//
// Nå er hierarkiet synlig OG rolig: uka er dagene, én av dem er åpen. Lukket
// sier hva dagen handler om; åpen er hele treninga med luft nok til å leses på
// banen.
//
// Måneden lå en stund som en hatt på toppen — en velger, to sheets og en
// arvingsmekanikk. Den er borte. Den EIDE dagene: hver periode fikk en
// sluttdato, og dagen etter fant verken denne siden eller Hjem noen gjeldende
// plan, så rytmen forsvant fra appen mens laget trente tirsdag som før. Og hver
// ny måned var en KOPI av forrige — rettet du tirsdagsfokuset ett sted, sto de
// elleve andre igjen med gammel tekst.
//
// Uka gjentar seg. Da ligger den ett sted og gjelder til noen endrer den.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { dagLink } from '../lib/trainingLinks'
import { useTrainingWeek } from '../composables/useTrainingWeek'
import { useExercises, exerciseToDrill, resolveDrills, ovelsensVideo } from '../composables/useExercises'
import OktListe from '../components/OktListe.vue'
import { hentDagensOppmote } from '../composables/useTreningsOkt'
import { useToast } from '../composables/useToast'
import { parseTreningsplan } from '../lib/treningParser'
import { accentForPosition } from '../lib/sessionVisuals'
import { WEEKDAY_LABELS } from '../lib/dateLabels'
import Sheet from '../components/Sheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ExercisePicker from '../components/ExercisePicker.vue'
import OvelseArk from '../components/OvelseArk.vue'
import Skeleton from '../components/Skeleton.vue'
import { meldEvent } from '../lib/sporing'
import { useAuth } from '../stores/auth'
import BackLink from '../components/BackLink.vue'

const { hasHandbook, principles } = useContent()

const route = useRoute()
const { days: dager, supportsDuration, fetchWeek, createDay, updateDay, removeDay, endreDrills, hentUkaForPoll } = useTrainingWeek()
const { exercises, supportsCategory, fetchExercises, createExercise } = useExercises()
const { show: showToast } = useToast()

// Ligger uka i cachen fra sist, tegnes den med en gang; skjelettet er for
// første besøk.
const loading = ref(dager.value.length === 0)

// ── Dagene ──────────────────────────────────────────────────────────────────
//
// Uka kommer ferdig sortert: ukedagen er fasit, og rader uten ukedag (gamle,
// eller nettopp opprettet) legger seg til slutt. Sorteringen bor i
// useTrainingWeek, slik at Hjem og foreldreflaten leser uka i samme rekkefølge
// som denne siden.

const formatDuration = varighet

function drillsFor(s) {
  return resolveDrills(s.drills, exercises.value)
}

// ── Teksten har allerede et hierarki ────────────────────────────────────────
//
// Fokuset er skrevet som «Ferdigheter under press. Bli sjef over ballen i
// trange rom — medtak, vending og første touch som tar deg ut av presset.»
// Første setning ER overskriften; resten er forklaringen. Vi trenger ikke et
// nytt felt for å vise det, bare å slutte å rendre alt som én blokk.
//
// Lukket dag viser bare overskriften. Før klippet vi to linjer med ellipse midt
// i et ord — «trange rom — medta…» er ingen oppsummering.
const LEDD_MAKS = 64

function delFokus(tekst) {
  const t = String(tekst || '').trim()
  if (!t) return { ledd: '', resten: '', delt: false }
  // Stor forbokstav etter punktumet: ellers deler vi på «kl. 18» og «nivå A, B.»
  const m = t.match(/^(.+?[.!?])\s+([A-ZÆØÅ][\s\S]*)$/)
  // «Samme rytme hver uke: Tirsdag ferdigheter, Torsdag dueller, Lørdag spill.»
  // er ÉN setning. Uten dette ble hele teksten satt som overskrift — fet og i
  // aksentfarge. Finner vi ingen overskrift, er det brødtekst, ikke en tittel.
  if (!m || m[1].length > LEDD_MAKS) return { ledd: t, resten: '', delt: false }
  return { ledd: m[1], resten: m[2], delt: true }
}

const fokus = computed(() => {
  const m = {}
  for (const s of dager.value) m[s.id] = delFokus(s.focus)
  return m
})

// Beskrivelsen rendres som den er skrevet. Et forsøk på å dele den i setninger
// gjettet på en struktur som nå finnes som egne felt — og flatet ut avsnittene
// i 6 av 15 øvelser: Napoli, Rosenborg og Southampton er skrevet med tomme
// linjer, og de skal stå. CSS-en gjør jobben (white-space: pre-line).
// ── Uka og dagen ────────────────────────────────────────────────────────────
//
// Uka er oversikten: én rolig kortrad per dag. Hver dag har sin egen side
// (/trening/dag/<id>) — et trekkspill i uka dyttet resten ned når det åpnet
// seg og hoppet når det lukket seg. Samme komponent viser begge; adressen
// bestemmer hvilken.
const router = useRouter()
const dagId = computed(() => route.params.dagId || null)
const openDayId = computed(() => dagId.value)
// Dagens trening øverst i uka: det er den du er på vei til.
const synligeDager = computed(() => {
  if (dagId.value) return dager.value.filter(s => s.id === dagId.value)
  const idag = dager.value.filter(s => s.weekday === todayWeekday())
  return [...idag, ...dager.value.filter(s => s.weekday !== todayWeekday())]
})
const fantIkkeDagen = computed(() => !!dagId.value && !loading.value && !synligeDager.value.length)

function apneDag(s) {
  router.push(dagLink(s.id))
}

// Ny side starter på toppen. Komponenten gjenbrukes mellom uka og dagen, så
// nettleseren gjør det ikke selv.
watch(dagId, () => window.scrollTo({ top: 0 }))

// Mandag = 1, søndag = 7 — samme skala som weekday-kolonnen.
function todayWeekday() {
  const js = new Date().getDay()
  return js === 0 ? 7 : js
}

function drillCount(s) {
  return (s.drills || []).length
}

// «3 øvelser» på det lukkede kortet: du skal se om dagen er planlagt eller tom
// uten å åpne den.
// Et lukket kort viser øvelsene, men ikke flere enn at uka fortsatt får plass.
const MAKS_LUKKET = 4

// ── Tid per øvelse ──────────────────────────────────────────────────────────
//
// Tida bor på drillen i økta, ikke på bankøvelsen: samme rondo er 10 minutter
// på tirsdag og 20 på lørdag. Lagres i drills-JSONB, så ingen migrasjon.
// (resolveDrills må bevare feltet — se DRILL_OWN_FIELDS i useExercises.)
const MIN_STEP = 5
const MIN_MAX = 60
const MIN_START = 10

function setDrillMinutes(s, i, minutes) {
  const m = Math.min(MIN_MAX, Math.max(0, minutes))
  const drill = s.drills?.[i]
  if (!drill) return
  queueDrills(s.id, ds => {
    const k = finnDrill(ds, drill, i)
    return k < 0 ? ds : ds.map((d, idx) => (idx === k ? { ...d, minutes: m || null } : d))
  })
}

// Fra «ingen tid» går første trykk rett til 10, ikke til 5: det er et
// utgangspunkt å justere fra. Ned fra 5 er å fjerne tida, ikke null minutter.
function stepDrillMinutes(s, i, d, delta) {
  const now = d.minutes || 0
  if (!now && delta > 0) { setDrillMinutes(s, i, MIN_START); return }
  setDrillMinutes(s, i, Math.max(0, now + delta))
}

// Plakaten fra videoen på rada i planmodus — det er bildet du kjenner øvelsen
// igjen på, ikke navnet.
function plakat(d) {
  return ovelsensVideo(d)?.poster || null
}

// ── Tidslinja ───────────────────────────────────────────────────────────────
//
// Økta er ikke en liste, den er en time. Klokka i venstremargen svarer på det
// du faktisk lurer på når du står på banen: hvor er vi nå, og hvor mye er igjen.
//
// Blokkene er IKKE proporsjonale med tida. Det var den opplagte varianten, men
// målingen sa nei: en 30-minutters kamp har ofte én setning tekst, så
// proporsjonal høyde ville lagt til tomrom akkurat der vi prøver å fjerne det.
// Klokka gir samme lesning gratis.
//
// Klokka løper bare når HVER øvelse har en tid. Mangler én, er summen en løgn —
// da står rekkefølgen der i stedet.
function klokke(min) {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}

function byggTidslinje(s) {
  const drills = drillsFor(s)
  const gaar = drills.length > 0 && drills.every(d => d.minutes > 0)
  let t = 0
  const rader = drills.map((d, i) => {
    const merke = gaar ? klokke(t) : String(i + 1)
    if (gaar) t += d.minutes
    return { d, i, merke }
  })

  // Summen er en endestasjon på linja, ikke et avsnitt over den.
  const sum = drills.reduce((a, d) => a + (d.minutes || 0), 0)
  const total = s.duration_min || 0
  let slutt = null
  if (sum) {
    const diff = total - sum
    slutt = {
      merke: gaar ? klokke(sum) : formatDuration(sum),
      tekst: !total ? 'til sammen'
        : diff === 0 ? 'går akkurat opp'
        : diff > 0 ? `${formatDuration(diff)} ledig`
        : `${formatDuration(-diff)} over ${formatDuration(total)}`,
      over: diff < 0
    }
  }
  return { rader, slutt }
}

const tidslinjer = computed(() => {
  const m = {}
  for (const s of dager.value) m[s.id] = byggTidslinje(s)
  return m
})

// ── Les eller planlegg ──────────────────────────────────────────────────────
//
// Den åpne dagen bar 16 knapper for 660 tegn innhold. Pilene, kryssene og
// tidsstepperne er planlegging — de hører hjemme i en annen modus enn den du
// leser i med ball i hånda. Én bryter, og lesemodus har null knapper per øvelse.
const editDayId = ref(null)

// ── Øvelsen bak ett trykk ───────────────────────────────────────────────────
//
// Før foldet øvelsen seg ut på stedet: momenter, rigg og beskrivelse som én
// tekstblokk under navnet — og uten «Se etter dette» og «Si dette til barna»,
// som er akkurat det du trenger mens øvelsen pågår. Banken hadde alt dette
// som navngitte kort. Nå åpner øvelsen i samme visning som banken bruker
// (ExerciseView), med Forrige/Neste nederst så du blar deg gjennom treninga
// uten å gå tilbake til lista mellom hver øvelse.
//
// Én rendring av øvelsen, to steder å komme til den fra.
const apen = ref(null) // { sessionId, i }

const apenDag = computed(() => dager.value.find(s => s.id === apen.value?.sessionId) || null)
const apenListe = computed(() => (apenDag.value ? drillsFor(apenDag.value) : []))

// «0:20–0:40»: når i treninga denne øvelsen ligger. Bare når klokka går —
// står rekkefølgen der i stedet, finnes det ikke noe tidsrom å vise.
const apenTidsrom = computed(() => {
  const s = apenDag.value
  if (!s || !apen.value) return ''
  const t = tidslinjer.value[s.id]
  const r = t?.rader[apen.value.i]
  if (!r || !/:/.test(r.merke)) return ''
  const slutt = t.rader[apen.value.i + 1]?.merke || t.slutt?.merke
  return slutt ? `${r.merke}–${slutt}` : r.merke
})

// Gruppene bor i økta (/trening/okt/:id), ikke her. Denne sida er for å
// lese og planlegge; økta er for å kjøre treninga.
const { isCoach } = useAuth()

function visDrill(s, i) {
  meldEvent('ovelse_apnet', { fra: 'treningsuke' })
  apen.value = { sessionId: s.id, i }
}


// «Ferdig» går tilbake til kjøreplanen, ikke til en lesemodus av samme liste.
function ferdig(s) {
  const til = dagLink(s.id)
  if (window.history.state?.back === til) router.back()
  else router.replace(til)
}

// Hver endring er en funksjon av lista, ikke en ferdig liste: den står på
// skjermen i samme trykk, og legges oppå den ferske lista fra basen rett før
// lagring (useTrainingWeek.endreDrills). Da visker ikke to trenere som
// planlegger samtidig ut hverandre. Gir true/false, aldri en feil: en feilet
// lagring tar endringen ut igjen og sier fra.
async function queueDrills(sessionId, mutate) {
  try {
    await endreDrills(sessionId, mutate)
    return true
  } catch {
    showToast('Fikk ikke lagret. Prøv igjen.', 'error')
    return false
  }
}

// Øvelsen i den ferske lista. En annen trener kan ha lagt til eller flyttet
// noe siden denne telefonen tegnet lista, så plassen alene holder ikke: lik
// øvelse nærmest plassen den sto på vinner.
function finnDrill(ds, drill, i) {
  const n = JSON.stringify(drill)
  const like = ds.map((d, k) => (JSON.stringify(d) === n ? k : -1)).filter(k => k > -1)
  const kandidater = like.length ? like
    : ds.map((d, k) => ((drill.exercise_id ? d.exercise_id === drill.exercise_id : d.text === drill.text) ? k : -1)).filter(k => k > -1)
  if (!kandidater.length) return -1
  return kandidater.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a))
}

// Pilene bytter plass innenfor dagen. De pleide å krysse over i nabodagen
// med en tre-bokstavers dagsforkortelse på knappen — «v TOR» — og ingen
// skjønte hva som ville skje. Å flytte til en annen dag er nå et valg med
// dagens fulle navn på, i arket for øvelsen.
function moveDrill(s, i, dir) {
  const j = dir === 'up' ? i - 1 : i + 1
  if (j < 0 || j >= (s.drills || []).length) return
  const drill = s.drills[i]
  queueDrills(s.id, ds => {
    const k = finnDrill(ds, drill, i)
    const m = dir === 'up' ? k - 1 : k + 1
    if (k < 0 || m < 0 || m >= ds.length) return ds
    const arr = [...ds]
    ;[arr[k], arr[m]] = [arr[m], arr[k]]
    return arr
  })
}

// ── Arket for én øvelse i planen ────────────────────────────────────────────
//
// Planmodus hadde 16 knapper på 30 px: to piler, et kryss og en tidsknapp per
// rad. Alt var treffbart på papiret og puslete i handa. Nå er rada én stor
// trykkflate, og alt du kan gjøre med øvelsen — tida, bytte den ut, flytte den
// til en annen dag, ta den ut — ligger i ett ark med knapper i full bredde.
// Pilene står igjen på rada, for rekkefølgen justerer du mens du ser lista.
const rad = ref(null) // { sessionId, i }

// Dagsida er planleggingen: kjøreplanen er lesevisningen (Alex, 17. nov).
// En trener som kommer hit, står rett i planmodus.
watch([openDayId, isCoach], () => {
  editDayId.value = dagId.value && isCoach.value ? dagId.value : null
  apen.value = null
  rad.value = null
}, { immediate: true })

const radDag = computed(() => dager.value.find(s => s.id === rad.value?.sessionId) || null)
const radDrill = computed(() => (radDag.value && rad.value ? drillsFor(radDag.value)[rad.value.i] || null : null))
const andreDager = computed(() => (radDag.value ? dager.value.filter(s => s.id !== radDag.value.id) : []))

function apneRad(s, i) {
  rad.value = { sessionId: s.id, i }
}

// Hele drill-objektet flyttes: tida og opphavet (exercise_id) følger med.
// Den legger seg nederst i dagen den lander i.
async function flyttTilDag(mal) {
  const s = radDag.value
  const i = rad.value?.i
  const drill = s?.drills?.[i]
  if (!drill || !mal) return
  rad.value = null
  // Legg til først, fjern etterpå. Omvendt ble øvelsen borte for godt om
  // lagringen i måldagen feilet.
  if (!(await queueDrills(mal.id, ds => [...ds, drill]))) return
  if (!(await queueDrills(s.id, ds => { const k = finnDrill(ds, drill, i); return k < 0 ? ds : ds.filter((_, idx) => idx !== k) }))) return
  showToast(`Flyttet til ${mal.title.toLowerCase()}`, 'success')
}

// Fjerne fra dagen er ikke sletting — øvelsen blir liggende i banken. Angre
// legger den tilbake på samme plass, med samme minutter.
async function removeDrill(s, i) {
  const d = s.drills?.[i]
  if (!d) return
  rad.value = null
  const fjern = queueDrills(s.id, ds => { const k = finnDrill(ds, d, i); return k < 0 ? ds : ds.filter((_, idx) => idx !== k) })
  showToast(d.exercise_id ? 'Fjernet — ligger i banken' : 'Fjernet', 'success', 5000, {
    action: { label: 'Angre', handler: () => angreFjern(s.id, d, i, fjern) }
  })
  await fjern
}

async function angreFjern(sessionId, d, i, fjern) {
  // Var fjerningen aldri lagret, står øvelsen der allerede.
  if (!(await fjern)) return
  queueDrills(sessionId, ds => {
    if (ds.some(x => JSON.stringify(x) === JSON.stringify(d))) return ds
    const arr = [...ds]
    arr.splice(Math.min(i, arr.length), 0, d)
    return arr
  })
}

// Fra arket og rett inn i øvelsen slik den leses på banen.
function visRadOvelse() {
  const r = rad.value
  rad.value = null
  if (r) apen.value = r
}

// Bytt ut: plukkeren åpner for akkurat denne plassen. Det du velger legger seg
// der den gamle sto, og tida blir stående — det er fortsatt 20 minutter i
// planen, bare med en annen øvelse i dem.
const bytteFor = ref(null) // { sessionId, i }

function startBytte() {
  const r = rad.value
  rad.value = null
  if (!r) return
  bytteFor.value = r
  pickerFor.value = r.sessionId
}

async function byttUt(ex) {
  const b = bytteFor.value
  const s = dager.value.find(d => d.id === b?.sessionId)
  if (!s) return
  const gammel = drillsFor(s)[b.i]
  bytteFor.value = null
  pickerFor.value = null
  const gammelRad = s.drills?.[b.i]
  if (!(await queueDrills(s.id, ds => {
    const k = gammelRad ? finnDrill(ds, gammelRad, b.i) : -1
    return k < 0 ? [...ds, exerciseToDrill(ex)] : ds.map((d, idx) => (idx === k ? { ...exerciseToDrill(ex), minutes: d.minutes ?? null } : d))
  }))) return
  showToast(gammel ? `«${gammel.text}» byttet ut med «${ex.name}»` : `«${ex.name}» lagt inn`, 'success')
}

// ── Plukkeren ───────────────────────────────────────────────────────────────
const pickerFor = ref(null)
const pickerSession = computed(() => dager.value.find(s => s.id === pickerFor.value) || null)

const bytteNavn = computed(() => {
  const b = bytteFor.value
  const s = dager.value.find(d => d.id === b?.sessionId)
  return s ? drillsFor(s)[b.i]?.text || '' : ''
})

function openPicker(s) { pickerFor.value = s.id }

function closePicker() {
  pickerFor.value = null
  bytteFor.value = null
}

function toggleExercise(ex) {
  if (bytteFor.value) { byttUt(ex); return }
  const s = pickerSession.value
  if (!s) return
  const match = d => d.exercise_id === ex.id || (d.text || '').trim().toLowerCase() === ex.name.trim().toLowerCase()
  const inDay = (s.drills || []).some(match)
  // Valget er det du så da du trykket: la til eller tok ut. Har en annen trener
  // alt gjort det samme, blir det ikke to.
  queueDrills(s.id, ds => (inDay ? ds.filter(d => !match(d)) : (ds.some(match) ? ds : [...ds, exerciseToDrill(ex)])))
}

async function createFromPicker(f) {
  const s = pickerSession.value
  if (!s) return
  const payload = {
    name: f.name.trim(),
    type: f.type,
    tema: f.tema.trim() || null,
    gruppe: (f.gruppe || '').trim() || null,
    organisering: f.organisering.trim() || null,
    laeringsmomenter: f.laeringsmomenter.split('\n').map(x => x.trim()).filter(Boolean),
    link: f.link.url.trim() ? { label: f.link.label.trim(), url: f.link.url.trim() } : null
  }
  if (supportsCategory.value) payload.category = f.category || null
  const row = await createExercise(payload)
  if (!row) return
  if (bytteFor.value) { byttUt(row); return }
  if (!(await queueDrills(s.id, ds => [...ds, exerciseToDrill(row)]))) return
  showToast(`«${row.name}» lagt til`, 'success')
}

// ── Dag: ukedag, lengde og fokus ────────────────────────────────────────────
//
// Ukedagen er en velger, ikke et tekstfelt. Da skriver du ikke «Tisdag», dagen
// sorterer seg selv inn på riktig plass, og navnet trenger ikke tolkes.
const DURATION_STEP = 15
const DURATION_MIN = 30
const DURATION_MAX = 150

const dayForm = ref(null)
const savingDay = ref(false)

const usedWeekdays = computed(() =>
  new Set(dager.value.filter(s => s.id !== dayForm.value?.id).map(s => s.weekday).filter(Boolean))
)

function openDayForm(s) {
  dayForm.value = {
    id: s.id,
    weekday: s.weekday ?? null,
    duration_min: s.duration_min ?? 90,
    focus: s.focus || '',
    fallbackTitle: s.title
  }
}

function openNewDay() {
  dayForm.value = { id: null, weekday: null, duration_min: 90, focus: '', fallbackTitle: '' }
}

function stepDuration(delta) {
  const next = (dayForm.value.duration_min || 90) + delta
  dayForm.value.duration_min = Math.min(DURATION_MAX, Math.max(DURATION_MIN, next))
}

async function saveDay() {
  const f = dayForm.value
  if (!f || savingDay.value) return
  // Ukedag er påkrevd for nye dager — det er den som gir både navn og plass.
  if (!f.id && !f.weekday) return
  savingDay.value = true
  const payload = {
    focus: f.focus.trim() || null,
    weekday: f.weekday,
    duration_min: f.duration_min,
    // Uten ukedag beholder vi navnet raden allerede har, i stedet for å blanke det.
    title: f.weekday ? WEEKDAY_LABELS[f.weekday - 1] : f.fallbackTitle
  }
  // Arket lukkes med en gang — endringen står i uka før svaret er tilbake.
  // Feiler lagringen, rulles uka tilbake (useTrainingWeek) og skjemaet åpnes
  // igjen med det du skrev.
  dayForm.value = null
  try {
    if (f.id) {
      await updateDay(f.id, payload)
    } else {
      await createDay({
        ...payload,
        accent: accentForPosition(dager.value.length),
        position: dager.value.length
      })
    }
  } catch {
    if (!dayForm.value) dayForm.value = f
    showToast('Fikk ikke lagret. Prøv igjen.', 'error')
  } finally {
    savingDay.value = false
  }
}

const deleteDayId = ref(null)
async function confirmDeleteDay() {
  try {
    await removeDay(deleteDayId.value)
  } catch {
    deleteDayId.value = null
    showToast('Dagen ble ikke slettet. Prøv igjen.', 'error')
    return
  }
  deleteDayId.value = null
  dayForm.value = null
  // Dagen du sto på finnes ikke lenger: tilbake til uka.
  if (dagId.value) router.replace('/trening')
}

// ── Lim inn plan (hurtiginnlegging fra mobil) ───────────────────────────────
const showPaste = ref(false)
const pasteText = ref('')
const savingPaste = ref(false)
const parsedPlan = computed(() => parseTreningsplan(pasteText.value))

async function confirmPaste() {
  const parsed = parsedPlan.value
  if (!parsed.sessions.length || savingPaste.value) return
  savingPaste.value = true
  const base = dager.value.length
  for (const [i, s] of parsed.sessions.entries()) {
    const drills = []
    for (const d of s.drills) {
      const ex = await createExercise({
        name: d.text,
        type: d.type || 'none',
        tema: d.tema || null,
        organisering: d.organisering || null,
        laeringsmomenter: d.laeringsmomenter || [],
        link: d.link || null
      })
      drills.push(ex ? exerciseToDrill(ex) : d)
    }
    try {
      await createDay({
        title: s.title,
        weekday: s.weekday,
        focus: s.focus || null,
        accent: accentForPosition(base + i),
        drills,
        position: base + i
      })
    } catch {
      // Teksten blir stående, så planen kan limes inn på nytt.
      savingPaste.value = false
      showToast(i ? `${i} av ${parsed.sessions.length} dager ble lagt til. Resten ble ikke lagret.` : 'Planen ble ikke lagret. Prøv igjen.', 'error')
      return
    }
  }
  savingPaste.value = false
  showPaste.value = false
  pasteText.value = ''
  showToast(`${parsed.sessions.length} ${parsed.sessions.length === 1 ? 'dag' : 'dager'} lagt til`, 'success')
}

// Dagens oppmøte per dag: knappen sier «24 her» når det er registrert.
const oppmoteIDag = ref({})
watch(isCoach, c => { if (c) hentDagensOppmote().then(m => { oppmoteIDag.value = m }) }, { immediate: true })

// Planen hentes når skjermen åpnes og når appen kommer fram igjen. Før ble
// hele uka med alle øvelsene hentet hvert 4.–10. sekund så lenge planen sto
// åpen. To trenere som redigerer samme dag i samme øyeblikk fanges uansett
// ved lagring («Dagen ble endret samtidig»). Del inn og økta følges fortsatt
// løpende (lib/poll): der står flere trenere på feltet samtidig.
function vedRetur() {
  if (document.visibilityState === 'visible') hentUkaForPoll().catch(() => {})
}
onMounted(async () => {
  await fetchWeek()
  fetchExercises()
  loading.value = false
  document.addEventListener('visibilitychange', vedRetur)
})
onUnmounted(() => { document.removeEventListener('visibilitychange', vedRetur) })
</script>

<template>
  <div class="uke">
    <div v-if="loading" class="uke__skeleton">
      <Skeleton v-for="n in 3" :key="n" height="140px" radius="var(--ds-radius-lg)" />
    </div>

    <!-- Ingen uke ennå. Merk at dette IKKE lenger kan bety «planen gikk ut» —
         uka har ingen sluttdato å gå ut på. Står det ingenting her, har ingen
         lagt inn en dag. -->
    <div v-else-if="!dager.length" class="ds-empty">
      <Spot name="training" class="ds-empty__illo" />
      <div class="ds-empty__title">Ingen treningsuke ennå</div>
      <div class="plan-actions">
        <button type="button" class="ds-btn ds-btn--primary" @click="openNewDay">Legg til dag</button>
        <button type="button" class="ds-btn ds-btn--secondary" @click="showPaste = true">Lim inn plan</button>
      </div>
    </div>

    <template v-else>
      <header v-if="!dagId" class="uke__head">
        <h1 class="uke__title">Trening</h1>
      </header>
      <nav v-else class="dagside__bar">
        <BackLink :to="isCoach && synligeDager[0] ? dagLink(synligeDager[0].id) : '/trening'" :label="isCoach && synligeDager[0] ? synligeDager[0].title : 'Trening'" historikk />
      </nav>
      <p v-if="fantIkkeDagen" class="dagside__tom">Fant ikke dagen. <router-link to="/trening">Til uka</router-link></p>

      <!-- Dagene: én åpen om gangen. Lukket er en løfte om innhold, åpen er
           hele treninga. Uka som helhet står fortsatt på siden. -->
      <section
        v-for="s in synligeDager"
        :key="s.id"
        :id="'dag-' + s.id"
        class="dag"
        :class="{ 'dag--open': openDayId === s.id, 'dag--side': !!dagId }"
      >
        <component
          :is="dagId ? 'div' : 'button'"
          :type="dagId ? null : 'button'"
          class="dag__toggle"
          @click="!dagId && apneDag(s)"
        >
          <span class="dag__head">
            <span class="dag__name">{{ s.title }}</span>
            <span v-if="!dagId && s.weekday === todayWeekday()" class="dag__idag">I dag</span>
            <span class="dag__meta">
              <span v-if="s.duration_min" class="dag__len">{{ formatDuration(s.duration_min) }}</span>
            </span>
            <Ikon navn="pil-hoyre" vekt="bold" v-if="!dagId" class="dag__chevron" />
          </span>
          <!-- Lukket: øvelsene. Fokuset er grunnen til at de
               ligger der, og står når dagen er åpen. -->
          <OktListe
            v-if="openDayId !== s.id && drillsFor(s).length"
            class="dag__okt"
            :drills="drillsFor(s)"
            :maks="MAKS_LUKKET"
          />
          <span v-else-if="openDayId !== s.id" class="dag__focus dag__focus--empty">Ingen øvelser ennå</span>
          <span v-else-if="s.focus" class="dag__focus">
            <span :class="fokus[s.id].delt ? 'dag__ledd' : 'dag__resten dag__resten--alene'">{{ fokus[s.id].ledd }}</span>
            <span v-if="fokus[s.id].resten" class="dag__resten">{{ fokus[s.id].resten }}</span>
          </span>
        </component>

        <!-- Dagens trening: rett til Del inn (oppmøte og inndeling). -->
        <router-link
          v-if="isCoach && openDayId !== s.id && (s.weekday === todayWeekday() || oppmoteIDag[s.id] != null)"
          to="/del-inn"
          class="dag__start"
        >Del inn<span v-if="oppmoteIDag[s.id] != null" class="dag__start-meta">{{ oppmoteIDag[s.id] }} her</span></router-link>

        <div v-if="openDayId === s.id" class="dag__body">
          <!-- LESEMODUS — økta som en time, ikke en liste. Klokka i margen,
               null knapper mellom deg og innholdet. -->
          <ol v-if="drillsFor(s).length && editDayId !== s.id" class="okt">
            <li v-for="r in tidslinjer[s.id].rader" :key="r.i" class="steg">
              <span class="steg__klokke">{{ r.merke }}</span>
              <span class="steg__prikk" aria-hidden="true"></span>

              <!-- Hele blokka er trykkflaten og åpner øvelsen. Navn, type, tid
                   og tema er det du sjekker underveis; alt annet ligger bak
                   trykket, strukturert som i banken. -->
              <button type="button" class="steg__hode" @click="visDrill(s, r.i)">
                <span class="steg__navnlinje">
                  <span class="steg__navn">{{ r.d.text }}</span>
                  <Ikon navn="pil-hoyre" vekt="bold" class="steg__pil" />
                </span>
                <!-- Diff/mix og tid er to korte, faste opplysninger — de deler
                     linje og står i ro. Temaet er det eneste som varierer i
                     lengde, og får derfor sin egen linje å vokse på. -->
                <span v-if="r.d.minutes || (r.d.type && r.d.type !== 'none')" class="steg__fakta">
                  <span v-if="r.d.type && r.d.type !== 'none'" class="ovelse__badge" :class="`ovelse__badge--${r.d.type}`">
                    {{ r.d.type === 'diff' ? 'Diff' : 'Mix' }}
                  </span>
                  <span v-if="r.d.minutes" class="steg__len">{{ formatDuration(r.d.minutes) }}</span>
                </span>
              </button>
            </li>

            <!-- Endestasjonen: summen hører til nederst på linja, ikke i et
                 eget avsnitt over øvelsene. -->
            <li v-if="tidslinjer[s.id].slutt" class="steg steg--slutt">
              <span class="steg__klokke steg__klokke--slutt" :class="{ 'steg__klokke--over': tidslinjer[s.id].slutt.over }">{{ tidslinjer[s.id].slutt.merke }}</span>
              <span class="steg__prikk steg__prikk--slutt" aria-hidden="true"></span>
              <span class="steg__sum" :class="{ 'steg__sum--over': tidslinjer[s.id].slutt.over }">{{ tidslinjer[s.id].slutt.tekst }}</span>
            </li>
          </ol>

          <!-- PLANMODUS — hele økta som rader med bilde. Rada er én trykkflate
               og åpner arket for øvelsen (tid, bytt ut, flytt, fjern). Pilene
               står på rada, for rekkefølgen justerer du mens du ser lista. -->
          <div v-else-if="editDayId === s.id" class="plan">
            <div class="plan__topp">
              <span class="plan__tittel">Planlegg treninga</span>
              <button type="button" class="ds-link" @click="dagId ? ferdig(s) : (editDayId = null)">Ferdig</button>
            </div>

            <ul v-if="drillsFor(s).length" class="plan__liste">
              <li v-for="(d, i) in drillsFor(s)" :key="i" class="rad">
                <button type="button" class="rad__hode" :aria-label="`Endre ${d.text}`" @click="apneRad(s, i)">
                  <span class="rad__bilde">
                    <img v-if="plakat(d)" :src="plakat(d)" alt="" loading="lazy" />
                    <span v-if="d.minutes" class="rad__tid">{{ formatDuration(d.minutes) }}</span>
                  </span>
                  <span class="rad__tekst">
                    <span class="rad__navn">{{ d.text }}</span>
                    <span class="rad__meta">
                      <template v-if="!d.minutes">Ingen tid satt</template>
                      <template v-else-if="d.tema">{{ d.tema }}</template>
                      <template v-else>{{ formatDuration(d.minutes) }}</template>
                    </span>
                  </span>
                </button>
                <span class="rad__piler">
                  <button type="button" class="pil pil--opp" :disabled="i === 0" aria-label="Flytt opp" @click="moveDrill(s, i, 'up')">
                    <Ikon navn="pil-opp" vekt="bold" />
                  </button>
                  <button type="button" class="pil pil--ned" :disabled="i === drillsFor(s).length - 1" aria-label="Flytt ned" @click="moveDrill(s, i, 'down')">
                    <Ikon navn="pil-ned" vekt="bold" />
                  </button>
                </span>
              </li>
            </ul>

            <p v-if="tidslinjer[s.id].slutt" class="plan__sum" :class="{ 'plan__sum--over': tidslinjer[s.id].slutt.over }">
              {{ tidslinjer[s.id].slutt.tekst }}
            </p>

            <button type="button" class="ds-link knapp--legg" @click="openPicker(s)">
              <Ikon navn="pluss" vekt="bold" />
              Legg til øvelse
            </button>
          </div>

          <!-- Foten: lesemodus har én vei videre — en ordentlig knapp, ikke en
               tekstlenke med blyant. Planmodus har dagen selv (ukedag, lengde, fokus). -->
          <div class="dag__foot">
            <button v-if="editDayId === s.id" type="button" class="ds-link dag__action" @click="openDayForm(s)">
              Rediger dagen
            </button>
            <button v-else type="button" class="ds-link" @click="editDayId = s.id">
              {{ drillsFor(s).length ? 'Planlegg treninga' : 'Legg til øvelser' }}
            </button>
          </div>
        </div>
      </section>

      <!-- Å legge til en dag er å forlenge lista, så handlinga står som siste
           linje i den, ikke som enda en boks. «Lim inn plan» bor i arket for
           ny dag: den brukes sjelden, og da er det nettopp en ny dag du vil ha. -->
      <button v-if="!dagId" type="button" class="ds-link uke__legg-til" @click="openNewDay">
        <Ikon navn="pluss" aria-hidden="true" />
        Legg til dag
      </button>

    </template>

    <!-- Banken og håndboka står utenfor uka, ikke inni den: er uka tom, er det
         nettopp da du trenger et sted å hente øvelser fra. Rader med motiv,
         ikke kort, så de leses som steder å gå og ikke som flere dager. Ingen
         overskrift: radene sier selv hva de er, og luft skiller dem fra uka. -->
    <section v-if="!loading && !dagId" class="uke__steder">
      <router-link to="/trening/ovelser" class="uke__sted">
        <Spot name="skills" class="uke__sted-illo" :size="44" />
        <span class="uke__sted-tekst">
          <span class="uke__sted-tittel">Øvelsesbank</span>
          <span class="uke__sted-under">{{ exercises.length ? `${exercises.length} øvelser` : 'Finn øvelser til dagene' }}</span>
        </span>
        <Ikon navn="pil-hoyre" class="uke__sted-pil" aria-hidden="true" />
      </router-link>
      <router-link v-if="hasHandbook" to="/trening/handbok" class="uke__sted">
        <Spot name="book" class="uke__sted-illo" :size="44" />
        <span class="uke__sted-tekst">
          <span class="uke__sted-tittel">Håndbok</span>
          <span class="uke__sted-under">{{ principles.length }} prinsipper</span>
        </span>
        <Ikon navn="pil-hoyre" class="uke__sted-pil" aria-hidden="true" />
      </router-link>
    </section>

    <!-- Dag: ukedag, lengde, fokus -->
    <Sheet :show="!!dayForm" :title="dayForm?.id ? 'Rediger dag' : 'Ny dag'" @close="dayForm = null">
      <form v-if="dayForm" @submit.prevent="saveDay">
        <div class="ds-form-group">
          <label class="ds-label">Ukedag</label>
          <div class="weekday-picker">
            <button
              v-for="(label, i) in WEEKDAY_LABELS"
              :key="label"
              type="button"
              :class="['weekday-pill', {
                'weekday-pill--active': dayForm.weekday === i + 1,
                'weekday-pill--taken': usedWeekdays.has(i + 1)
              }]"
              :disabled="usedWeekdays.has(i + 1)"
              :title="usedWeekdays.has(i + 1) ? `${label} ligger allerede i uka` : label"
              :aria-label="label"
              :aria-pressed="dayForm.weekday === i + 1"
              @click="dayForm.weekday = i + 1"
            >{{ label.slice(0, 3) }}</button>
          </div>
        </div>

        <div v-if="supportsDuration" class="ds-form-group">
          <label class="ds-label">Lengde</label>
          <div class="stepper">
            <button
              type="button"
              class="stepper__btn"
              aria-label="Kortere"
              :disabled="dayForm.duration_min <= 30"
              @click="stepDuration(-15)"
            >−</button>
            <span class="stepper__value">{{ formatDuration(dayForm.duration_min) }}</span>
            <button
              type="button"
              class="stepper__btn"
              aria-label="Lengre"
              :disabled="dayForm.duration_min >= 150"
              @click="stepDuration(15)"
            >+</button>
          </div>
        </div>

        <div class="ds-form-group">
          <label class="ds-label" for="dag-focus">Fokus</label>
          <textarea id="dag-focus" v-model="dayForm.focus" class="ds-input" rows="3" placeholder="F.eks. Ferdigheter under press"></textarea>
        </div>

        <div class="sheet-actions">
          <button v-if="dayForm.id" type="button" class="ds-btn ds-btn--ghost sheet-actions__danger" @click="deleteDayId = dayForm.id">Slett dagen</button>
          <button type="submit" class="ds-btn ds-btn--primary ds-btn--lg sheet-actions__save" :disabled="(!dayForm.id && !dayForm.weekday) || savingDay">
            {{ savingDay ? 'Lagrer …' : dayForm.id ? 'Lagre' : 'Legg til dagen' }}
          </button>
        </div>
        <button v-if="!dayForm.id" type="button" class="ds-btn ds-btn--ghost dag-lim" @click="dayForm = null; showPaste = true">
          Lim inn hele planen
        </button>
      </form>
    </Sheet>

    <!-- Lim inn plan -->
    <Sheet :show="showPaste" title="Lim inn plan" @close="showPaste = false">
      <textarea
        v-model="pasteText"
        class="ds-input paste-input"
        rows="9"
        placeholder="Tirsdag: Ferdigheter under press
- Medtak og vending (diff)
- 3v3 med press i ryggen

Torsdag
- Ferdighetssirkel
- Vinneren står (mix)"
      ></textarea>

      <div v-if="parsedPlan.sessions.length" class="paste-preview">
        <div v-for="(s, i) in parsedPlan.sessions" :key="i" class="paste-preview__row">
          <span class="paste-preview__day">{{ s.title }}</span>
          <span class="paste-preview__meta">{{ s.drills.length }} {{ s.drills.length === 1 ? 'øvelse' : 'øvelser' }}</span>
        </div>
      </div>

      <button
        type="button"
        class="ds-btn ds-btn--primary ds-btn--lg paste-save"
        :disabled="!parsedPlan.sessions.length || savingPaste"
        @click="confirmPaste"
      >
        {{ savingPaste ? 'Lagrer …' : parsedPlan.sessions.length ? `Legg til ${parsedPlan.sessions.length} ${parsedPlan.sessions.length === 1 ? 'dag' : 'dager'}` : 'Legg til dager' }}
      </button>
    </Sheet>

    <ExercisePicker
      :show="!!pickerFor"
      :title-prefix="pickerSession?.title"
      :current-drills="pickerSession?.drills || []"
      :replace-name="bytteNavn"
      @close="closePicker"
      @toggle="toggleExercise"
      @create="createFromPicker"
    />

    <!-- Arket for én øvelse i planen: tida øverst, så det du kan gjøre med den.
         Store knapper i full bredde — det er dette som før var 30 px-ikoner. -->
    <Sheet :show="!!radDrill" :title="radDrill?.text || ''" @close="rad = null">
      <template v-if="radDrill">
        <p class="rad-ark__hvor">{{ radDag.title }} · {{ rad.i + 1 }} av {{ drillsFor(radDag).length }}</p>

        <div class="rad-ark__tid">
          <span class="rad-ark__merke">Tid i dag</span>
          <div class="stepper">
            <button type="button" class="stepper__btn" aria-label="Kortere" :disabled="!radDrill.minutes" @click="stepDrillMinutes(radDag, rad.i, radDrill, -MIN_STEP)">−</button>
            <span class="stepper__value" :class="{ 'stepper__value--tom': !radDrill.minutes }">{{ radDrill.minutes ? formatDuration(radDrill.minutes) : 'Ingen tid' }}</span>
            <button type="button" class="stepper__btn" aria-label="Lengre" :disabled="(radDrill.minutes || 0) >= MIN_MAX" @click="stepDrillMinutes(radDag, rad.i, radDrill, MIN_STEP)">+</button>
          </div>
        </div>

        <div class="rad-ark__valg">
          <button type="button" class="valg" @click="visRadOvelse">
            <span>Vis øvelsen</span>
            <Ikon navn="pil-hoyre" />
          </button>
          <button type="button" class="valg valg--bytt" @click="startBytte">
            <span>Bytt ut med en annen øvelse</span>
            <Ikon navn="pil-hoyre" />
          </button>
          <button v-for="mal in andreDager" :key="mal.id" type="button" class="valg" @click="flyttTilDag(mal)">
            <span>Flytt til {{ mal.title.toLowerCase() }}</span>
            <Ikon navn="pil-hoyre" />
          </button>
          <button type="button" class="valg valg--fjern" @click="removeDrill(radDag, rad.i)">
            <span>Fjern fra dagen</span>
          </button>
        </div>
      </template>
    </Sheet>

    <!-- Øvelsen — samme ark som økta. Forrige/Neste nederst: på banen
         blar du gjennom treninga, du navigerer ikke. -->
    <OvelseArk
      :liste="apenListe"
      :i="apen ? apen.i : null"
      :hvor="apenDag && apen ? `${apenDag.title} · ${apen.i + 1} av ${apenListe.length}${apenTidsrom ? ' · ' + apenTidsrom : ''}` : ''"
      @update:i="j => (apen = j == null ? null : { ...apen, i: j })"
    />

    <ConfirmDialog
      :show="!!deleteDayId"
      title="Slett dagen?"
      message="Dagen og øvelseslista på den blir borte. Øvelsene blir liggende i banken."
      confirm-label="Slett"
      variant="warning"
      @confirm="confirmDeleteDay"
      @cancel="deleteDayId = null"
    />

  </div>
</template>

<style scoped>

.uke {
  max-width: var(--ds-content-max);
  margin: 0 auto;
  padding: var(--ds-space-md) var(--ds-space-lg) var(--ds-space-2xl);
}

.uke__skeleton { display: flex; flex-direction: column; gap: var(--ds-space-md); }

.uke__head { margin-bottom: var(--ds-space-xl); }

/* Sidetittel i en fane: sans, som Hjem, Kamper og Statistikk. Serifen er
   innholdets stemme (håndboka, referatene, navnene), ikke navigasjonens. */
.uke__title {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-2xl);
  font-weight: var(--ds-weight-black);
  letter-spacing: var(--ds-tracking-tight);
  line-height: var(--ds-leading-tight);
  color: var(--ds-color-text-primary);
  font-variation-settings: normal;
  font-feature-settings: normal;
  margin: 0;
}

/* ---- Dagen ---- */
.dag {
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  margin-bottom: var(--ds-space-md);
  overflow: hidden;
  /* Pusterom når toggleDay scroller kortet til toppen */
  scroll-margin-top: var(--ds-space-md);
}

/* Den åpne dagen er dit blikket skal. Skyggen løfter den ut av rekka uten at
   de lukkede trenger å dempes ned til grått. */
.dag--open {
  box-shadow: var(--ds-shadow-md);
  margin-bottom: var(--ds-space-lg);
}

/* Hele toppen er trykkflaten — 44px+ uansett, og ingen jakt på et lite ikon */
.dag__toggle {
  display: block;
  width: 100%;
  padding: var(--ds-space-lg) var(--ds-space-lg) var(--ds-space-md);
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.dag--open .dag__toggle { padding-bottom: var(--ds-space-sm); }

.dag__idag {
  display: inline-flex; align-items: center; flex-shrink: 0;
  height: 22px; padding: 0 var(--ds-space-12);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-accent); color: var(--ds-color-accent-text);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-xs, 12px); font-weight: var(--ds-weight-semibold);
  letter-spacing: 0; text-transform: none;
  align-self: center;
}

.dag__head {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-sm);
  min-width: 0;
}

.dag__name {
  flex: 0 1 auto;
  min-width: 0;
  /* Ukedagen klippes aldri. Lange egne titler brytes mellom ord. */
  overflow-wrap: break-word;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: -0.01em;
  color: var(--ds-color-text-primary);
}

/* Lengde og antall står ved dagen, ikke i et skjema du må åpne for å vite det */
.dag__meta {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-sm);
  flex-shrink: 0;
  margin-left: auto;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-secondary);
  white-space: nowrap;
}

/* På et lukket kort under 400 px konkurrerer «1 t 30 min · 3 øvelser» ut
   dagsnavnet — på 360 ble det «TORS…». Lengden viker: den står i dagen når du
   åpner den. Antallet svarer på om dagen i det hele tatt er planlagt, og blir
   stående. */
@media (max-width: 359px) {
  .dag:not(.dag--side) .dag__meta { display: none; }
  .dag:not(.dag--side) .dag__chevron { margin-left: auto; }
}

.dag__chevron {
  flex-shrink: 0;
  align-self: center;
  width: 16px;
  height: 16px;
  color: var(--ds-color-text-tertiary);
  transition: transform var(--ds-duration-fast) var(--ds-ease-out);
}

.dag--open .dag__chevron { transform: none; }

/* Dagen som egen side: ikke et kort i en liste, men siden selv. */
.dagside__bar { margin: 0 0 var(--ds-space-md) calc(-1 * var(--ds-space-xs)); }
.dagside__tom { color: var(--ds-color-text-secondary); font-size: var(--ds-text-sm); }
.dag--side {
  background: transparent;
  border: 0;
  box-shadow: none;
  overflow: visible;
}
.dag--side .dag__toggle { padding: 0 0 var(--ds-space-md); cursor: default; }
.dag--side .dag__name { font-size: var(--ds-text-2xl); }
.dag--side .dag__body { padding-left: 0; padding-right: 0; }

@media (prefers-reduced-motion: reduce) {
  .dag__chevron { transition: none; }
}

/* Fokuset er grunnen til at akkurat disse øvelsene ligger her — så det står
   under dagen, ikke inne i den.

   Dagene bar hver sin dekorfarge: kant, overskrift, prikker, tema og merker i
   samme tone. Tre dager ble tre farger, og to av dem var brune. Fargen sa
   ingenting navnet ikke allerede sa — det er tirsdag fordi det står TIRSDAG.
   Nå er hierarkiet vekt og størrelse, som resten av appen. */
.dag__focus {
  display: block;
  margin-top: var(--ds-space-sm);
  font-size: var(--ds-text-md);
  line-height: 1.5;
  color: var(--ds-color-text-secondary);
  font-weight: var(--ds-weight-regular);
  letter-spacing: -0.005em;
}

.dag__ledd {
  display: block;
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

.dag__resten {
  display: block;
  margin-top: var(--ds-space-xs);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-regular);
  line-height: 1.55;
  color: var(--ds-color-text-secondary);
}

/* Fant vi ingen overskrift, er det bare brødtekst — og da skal den ikke ha
   luft over seg som om den fulgte etter noe. */
.dag__resten--alene { margin-top: 0; }

/* Lukket viser bare overskriften — klippet biter bare på et fokus som er
   skrevet som én lang setning. */
.dag__focus--clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dag__okt { margin-top: var(--ds-space-md); }

.dag__focus--empty {
  color: var(--ds-color-text-tertiary);
  font-weight: var(--ds-weight-regular);
  font-size: var(--ds-text-sm);
}

.dag__start {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-12);
  min-height: 44px;
  margin: 0 var(--ds-space-lg) var(--ds-space-lg);
  padding: 0 var(--ds-space-20);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.dag__start:active { background: var(--ds-color-bg-subtle); }
.dag__start-meta {
  color: var(--ds-color-text-tertiary);
  font-weight: var(--ds-weight-medium);
  font-variant-numeric: tabular-nums;
}




.dag__body {
  padding: 0 var(--ds-space-lg) var(--ds-space-lg);
}

/* ---- Økta som tidslinje ----

   Målt før omskrivinga: en åpen dag med fire øvelser var 1140 px — 1,35
   skjermer — for 660 tegn innhold, og bar 16 knapper. Det var ikke teksten som
   var for mye. Det var alt som lå rundt den.

   Nå: klokka i venstremargen, navnet først, detaljen bak ett trykk. Ingen
   knapper mellom deg og innholdet i lesemodus. */
.okt {
  position: relative;
  list-style: none;
  margin: 0;
  padding: var(--ds-space-md) 0 0;
  border-top: 1px solid var(--ds-color-border-light);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-lg);
}

/* 46 px margin: bred nok til «1:05», smal nok til at navnet fortsatt eier
   venstrekanten. Linja går på 34 px, midt mellom tall og tekst. */
.steg {
  position: relative;
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: start;
}

/* Linja tegnes per steg og strekkes over mellomrommet ned til neste prikk —
   ett sammenhengende spor, uten at containeren må vite hvor prikkene havner. */
.steg::before {
  content: '';
  position: absolute;
  left: 41px;
  top: 10px;
  bottom: calc(-1 * var(--ds-space-lg) - 10px);
  width: 1px;
  background: var(--ds-color-border-light);
}

.steg--slutt::before,
.steg:last-child::before { display: none; }

.steg__klokke {
  padding: var(--ds-space-xs) var(--ds-space-lg) 0 0;
  text-align: right;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: var(--ds-color-text-tertiary);
}

.steg__klokke--slutt { color: var(--ds-color-text-secondary); }
.steg__klokke--over { color: var(--ds-color-text-primary); }

/* Ringen i kortfargen kutter linja, så prikken sitter PÅ sporet og ikke oppå. */
.steg__prikk {
  position: absolute;
  left: 36px;
  top: 6px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--ds-color-text-primary);
  border: 3px solid var(--ds-color-bg-elevated);
}

.steg__prikk--slutt { background: var(--ds-color-text-tertiary); }

.steg__blokk { min-width: 0; }

/* Hele blokka er trykkflaten — ingen jakt på en liten pil. */
.steg__hode {
  display: block;
  width: 100%;
  min-height: 44px;
  margin: 0;
  padding: 0 0 var(--ds-space-2xs);
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.steg__navnlinje {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-sm);
  min-width: 0;
}

.steg__navn {
  min-width: 0;
  overflow-wrap: break-word;
  hyphens: auto;
  font-family: var(--ds-font-display-sans);
  /* 20px brakk to av tre øvelsesnavn på 390 px, og en tolinjers tittel over en
     enlinjers gjør lista ujevn. 16 px brekker ett av tre og tar 45 px av dagen.
     Hierarkiet ligger i vekt og farge, ikke i punktene. */
  font-size: var(--ds-text-base);
  font-weight: var(--ds-weight-semibold);
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-primary);
}

.steg__pil {
  flex: none;
  margin: var(--ds-space-xs) 0 0 auto;
  width: 15px;
  height: 15px;
  color: var(--ds-color-text-tertiary);
}

/* Tema og lengde på samme linje: hva øvelsen handler om, og hvor lenge den
   varer. Klokka i margen sier når den begynner — de tre svarer på hver sin ting. */
/* Metalinja wrappet: «15 min» havnet på linje to eller tre avhengig av hvor
   langt fokusområdet var, så tallet flyttet seg fra rad til rad. Nå bærer
   linja bare de to som har fast bredde, og den kan ikke brekke. */
.steg__fakta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-12);
  margin-top: var(--ds-space-xs);
  font-size: var(--ds-text-sm);
  line-height: 1.45;
  letter-spacing: -0.005em;
}


.steg__len {
  color: var(--ds-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.steg__sum {
  padding-top: var(--ds-space-xs);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  letter-spacing: -0.005em;
  color: var(--ds-color-text-tertiary);
}

/* Over tida er ikke en feil — planen din er bare lengre enn dagen. Mørkere,
   ikke rødt: det er en opplysning, ikke en alarm. */
.steg__sum--over { color: var(--ds-color-text-primary); }

.ovelse__badge {
  flex-shrink: 0;
  align-self: center;
  padding: var(--ds-space-2xs) var(--ds-space-sm);
  border-radius: var(--ds-radius-full);
  font-size: var(--ds-text-2xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ovelse__badge--diff { background: var(--ds-badge-bg); color: var(--ds-badge-text); }
.ovelse__badge--mix { background: transparent; color: var(--ds-badge-text); box-shadow: inset 0 0 0 1px var(--ds-badge-border); }

/* ---- Planmodus ----

   Rekkefølge og tid er planlegging, ikke lesing. Her ligger hele økta som korte
   rader, så du ser det du faktisk endrer — fire rader på én skjerm i stedet for
   fire fulle øvelser du må scrolle mellom for å flytte noe forbi hverandre. */
.plan {
  padding-top: var(--ds-space-md);
  border-top: 1px solid var(--ds-color-border-light);
}

.plan__topp {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-xs);
}

.plan__tittel {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: normal;
  color: var(--ds-color-text-tertiary);
}



.plan__liste {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* Rada: bilde, navn, piler. Én trykkflate for alt som gjelder øvelsen, og to
   piler for rekkefølgen. Det som før var fire 30 px-knapper på én linje. */
.rad {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-sm) 0;
  border-bottom: 1px solid var(--ds-color-border-light);
}

.rad:last-child { border-bottom: none; }

/* Smal skjerm: mindre bilde, så navnet får plass ved siden av pilene. */
@media (max-width: 379px) { .rad { --rad-bilde: 72px; } }

.rad__hode {
  display: grid;
  grid-template-columns: var(--rad-bilde, 96px) minmax(0, 1fr);
  align-items: center;
  gap: var(--ds-space-sm);
  min-width: 0;
  min-height: 56px;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.rad__hode:active .rad__bilde { transform: scale(0.97); }

/* Samme kort som i banken, i lommeformat: 96 × 54. */
.rad__bilde {
  position: relative;
  display: block;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--ds-radius-sm);
  border: 1px solid var(--ds-color-border-light);
  background: var(--ds-color-bg-subtle);
  transition: transform var(--ds-duration-fast) var(--ds-ease-out);
}

.rad__bilde img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rad__tid {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 1px var(--ds-space-xs);
  border-radius: var(--ds-radius-sm);
  font-size: var(--ds-text-2xs);
  font-weight: var(--ds-weight-medium);
  font-variant-numeric: tabular-nums;
  background: rgba(10, 10, 10, 0.72);
  color: #fff;
}

.rad__tekst {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  min-width: 0;
}

.rad__navn {
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-base);
  font-weight: var(--ds-weight-semibold);
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-primary);
  /* Ett langt ord («Ferdighetssirkel») skal brytes, ikke klippes uten ellipse. */
  overflow-wrap: anywhere;
}

.rad__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
}

/* To piler stablet, like høye som rada. Sammen er de én kontroll med en ramme,
   så de ikke leses som to løse ikoner. */
.rad__piler {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.pil {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.pil svg { width: 18px; height: 18px; }
.pil:disabled { color: var(--ds-color-border-strong); cursor: default; }
.pil:not(:disabled):active { background: var(--ds-color-bg-hover); }

.plan__sum {
  margin: var(--ds-space-md) 0 0;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  letter-spacing: -0.005em;
  color: var(--ds-color-text-tertiary);
}

.plan__sum--over { color: var(--ds-color-text-primary); }


.knapp--legg { margin-top: var(--ds-space-md); }
.knapp--legg svg { width: 16px; height: 16px; }

/* Ghost-knappen har egen innmarg; trekk den ut så teksten står på linje med innholdet. */
.dag__action { margin-left: 0; }

/* ---- Arket for én øvelse i planen ---- */
.rad-ark__hvor {
  margin: 0 0 var(--ds-space-lg);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
}

.rad-ark__tid { margin-bottom: var(--ds-space-lg); }

.rad-ark__merke {
  display: block;
  margin-bottom: var(--ds-space-sm);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

.stepper__value--tom { color: var(--ds-color-text-tertiary); font-weight: var(--ds-weight-medium); }

.rad-ark__valg {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--ds-color-border-light);
}

.valg {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  width: 100%;
  min-height: 56px;
  padding: 0;
  border: none;
  border-bottom: 1px solid var(--ds-color-border-light);
  background: none;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-base);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.valg svg { flex: none; width: 18px; height: 18px; color: var(--ds-color-text-tertiary); }
.valg:active { background: var(--ds-color-bg-subtle); }
.valg--fjern { color: var(--ds-color-error); }

/* ---- Foten i en åpen dag ---- */
.dag__foot {
  display: flex;
  justify-content: flex-start;
  margin-top: var(--ds-space-lg);
}



/* ---- Bunn ---- */
.uke__legg-til { margin: var(--ds-space-md) 0 var(--ds-space-2xl); }

.uke__legg-til svg { width: 16px; height: 16px; }

@media (hover: hover) and (pointer: fine) {
  .uke__legg-til:hover { background: var(--ds-color-bg-subtle); }
}

.uke__legg-til:active { transform: scale(0.97); }

.uke__sted {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  min-height: 64px;
  padding: var(--ds-space-sm) 0;
  text-decoration: none;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 150ms ease;
}

.uke__sted + .uke__sted { border-top: 1px solid var(--ds-color-border-light); }

.uke__sted:active { opacity: 0.6; }

.uke__sted-illo { --spot-size: 44px; }

.uke__sted-tekst {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2xs);
  flex: 1;
  min-width: 0;
}

.uke__sted-tittel {
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

.uke__sted-under {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.uke__sted-pil {
  width: 18px;
  height: 18px;
  flex: none;
  color: var(--ds-color-text-tertiary);
}

.dag-lim {
  width: 100%;
  margin-top: var(--ds-space-sm);
  color: var(--ds-color-text-secondary);
  font-weight: var(--ds-weight-regular);
}

/* ---- Tom tilstand ---- */
.plan-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-sm);
}

/* ---- Sheets ---- */
.sheet-actions {
  display: flex;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
}

.sheet-actions__danger { flex-shrink: 0; color: var(--ds-color-error); }
.sheet-actions__save { flex: 1; }

/* ---- Ukedagsvelger ---- */
/* Sju like kolonner: uka står på én linje på alle bredder. Med flex-wrap
   falt søndag ned alene og ble strukket over hele arket. */
.weekday-picker { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--ds-space-xs); }

.weekday-pill {
  min-width: 0;
  height: 44px;
  padding: 0;
  border-radius: var(--ds-radius-full);
  border: 1px solid var(--ds-color-border);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-secondary);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: all var(--ds-duration-fast) var(--ds-ease-out);
}

.weekday-pill--active {
  background: var(--ds-color-accent);
  border-color: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}

/* Dagen ligger allerede i uka — to «lørdag» ville hett det samme. */
.weekday-pill--taken {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ---- Lengde ---- */
.stepper {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
}

/* 44 px var nok for tommelen, men tegnet inni var 18 px — kontrollen var
   treffbar og likevel puslete. Flaten OG symbolet må være store. */
.stepper__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  font-family: var(--ds-font-body);
  font-size: 1.75rem;
  font-weight: var(--ds-weight-regular);
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color var(--ds-duration-fast) var(--ds-ease-out);
}

.stepper__btn:disabled { opacity: 0.35; cursor: not-allowed; }
.stepper__btn:not(:disabled):active { transform: scale(0.95); }

/* Tallet er det du leser mens du justerer — da skal det være det største på
   linja, ikke minste. */
.stepper__value {
  flex: 1;
  text-align: center;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
  font-variant-numeric: tabular-nums;
}

.paste-input { width: 100%; font-size: var(--ds-text-sm); line-height: 1.5; resize: vertical; }

.paste-preview { display: flex; flex-direction: column; gap: var(--ds-space-xs); margin-top: var(--ds-space-md); }

.paste-preview__row {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-12) var(--ds-space-12);
  background: var(--ds-color-bg-subtle);
  border-radius: var(--ds-radius-md);
}

.paste-preview__day { font-weight: var(--ds-weight-semibold); font-size: var(--ds-text-sm); }
.paste-preview__meta { font-size: var(--ds-text-xs); margin-left: auto; color: var(--ds-color-text-tertiary); }

.paste-save { width: 100%; margin-top: var(--ds-space-md); }


</style>
