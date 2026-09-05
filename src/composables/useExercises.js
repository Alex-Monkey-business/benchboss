import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { demoId } from './useTrainingWeek'
import { registerReset } from '../stores/dataReset'
import { clubScoped, withClub, cohortId } from '../lib/scope'
import { useAuth } from '../stores/auth'

// Øvelsesbank — gjenbrukbare øvelser (training_exercises).
// Copy-on-add: banken er malen, økta eier sin egen kopi (drills-JSONB).

const exercises = ref([])
const loading = ref(false)
const loaded = ref(false)
// Kull-navnene i klubben din. `cohorts` er medlemsskapsstyrt, så en trener i
// G2020 kan ikke lese raden til G2015 — men navnet på et kull i sin egen klubb
// skal han se, ellers står øvelsene der uten avsender.
const kullNavn = ref({})

registerReset(() => { exercises.value = []; loading.value = false; loaded.value = false; kullNavn.value = {} })

// «Halsen G2015» → «G2015». Inne i Halsen er klubbnavnet støy.
export function kortKullnavn(navn, klubbKortnavn = '') {
  const s = String(navn || '').trim()
  if (!s) return ''
  const utenKlubb = klubbKortnavn
    ? s.replace(new RegExp(`^${klubbKortnavn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '').trim()
    : s
  return utenKlubb || s
}

// Kanonisk kategorirekkefølge — banken og plukkeren grupperes og sorteres etter denne.
// Ukategoriserte samles i «Annet» nederst.
export const EXERCISE_CATEGORIES = [
  { value: 'oppvarming', label: 'Oppvarming' },
  { value: 'sjef-over-ballen', label: 'Sjef over ballen' },
  { value: 'pasning', label: 'Pasning' },
  { value: 'skudd', label: 'Skudd' },
  { value: 'spill', label: 'Spill' }
]

// Utstyret som fast liste. «småmål», «4 småmål» og «småmål på hver bane» er
// samme krav skrevet tre måter — som tag er det ett krav. Detaljene («27
// baller») står fortsatt i utstyr-fritekst; denne lista er det som sorterer.
export const EQUIPMENT_TAGS = [
  { value: 'smamal', label: 'Småmål' },
  { value: 'store_mal', label: 'Store mål' },
  { value: 'kjegler', label: 'Kjegler' },
  { value: 'porter', label: 'Porter' },
  { value: 'vester', label: 'Vester' },
  { value: 'baller', label: 'Baller' },
  { value: 'keeper', label: 'Keeper' }
]

// To verdier, ikke fem. Den ekte beslutningen er «har vi banen, eller står vi
// i gymsalen» — mellomkategorier krever en vurdering per øvelse uten å endre
// hva treneren faktisk gjør.
export const PLASS = [
  { value: 'liten', label: 'Liten plass' },
  { value: 'stor', label: 'Stor plass' }
]

// Fotballkull regnes på årstall, ikke bursdag: G2015 er «11-åringene» hele
// 2026. Har kullet ingen birth_year — «Halsen – nytt kull» i prod har ikke
// det — finnes ingen alder å regne fra, og da filtrerer vi ingenting bort.
export function kullAlder(cohort) {
  const ar = cohort?.birth_year
  if (!ar) return null
  return new Date().getFullYear() - ar
}

// Anbefaling, ikke regel. Øvelser uten min_alder passer alle: de fleste i
// banken har ingen kilde til et tall, og fravær av opplysning skal ikke lese
// som «for vanskelig».
export function passerAlder(ex, alder) {
  if (alder == null) return true
  if (!ex?.min_alder) return true
  return ex.min_alder <= alder
}

export function equipmentLabel(v) {
  return EQUIPMENT_TAGS.find(t => t.value === v)?.label || v
}

export function plassLabel(v) {
  return PLASS.find(pl => pl.value === v)?.label || ''
}

// «4-9», «Fra 4», «Opptil 9» — eller ingenting. Tallene er valgfrie hver for
// seg, og en halv opplysning er fortsatt en opplysning.
export function spillereLabel(min, maks) {
  if (min && maks) return min === maks ? String(min) : `${min}–${maks}`
  if (min) return `Fra ${min}`
  if (maks) return `Opptil ${maks}`
  return ''
}

export function groupByCategory(list) {
  const groups = EXERCISE_CATEGORIES.map(c => ({ ...c, items: list.filter(e => e.category === c.value) }))
  const rest = list.filter(e => !e.category || !EXERCISE_CATEGORIES.some(c => c.value === e.category))
  if (rest.length) groups.push({ value: 'annet', label: 'Annet', items: rest })
  return groups.filter(g => g.items.length)
}

const DEMO_EXERCISES = [
  { id: 'dex-1', se_etter: ['Kroppen kommer mellom ball og kjegle i finta', 'Ballen ligger tett på foten hele slalåmen', 'Ingen stopp mellom vending og pasning'], si_til_barna: ['Ta den ut til siden', 'Se opp', 'Full fart ut'], category: 'sjef-over-ballen', name: 'Medtak, dribling, vending og pasning', type: 'diff', tema: 'Spille oss fremover', gruppe: 'To og to per stasjon.', organisering: 'Pasning gjennom port, retningsbestemt medtak, dribling forbi kjegler, finte mot passivt press, vending ved siste kjegle. Bytt roller.', laeringsmomenter: ['Mykt medtak ut til siden — fremover på andre touch', 'Løft blikket og finn timing på finta', 'Finte med tempo og store bevegelser for å passere'], video: { url: 'https://httpcache0-80501-cachedown0.dna.ip-only.net/80501-cachedown0/assets/d5/d5dnpd5v8r1s73d86beg/d5dnpclv8r1s73a4mm5g_480p.mp4', poster: 'https://httpcache0-80501-cachedown0.dna.ip-only.net/80501-cachedown0/assets/d5/d5dnpd5v8r1s73d86beg/d5dnpclv8r1s73a4mm5g_720p_5.jpeg', duration: 22, source: 'tiim', source_url: 'https://tiim.no/ovelse/medtak-dribling-vending-pasning' }, link: { label: 'Medtak, dribling, vending, pasning', url: 'https://tiim.no/ovelse/medtak-dribling-vending-pasning' } },
  { id: 'dex-2', se_etter: ['Forsvarerne presser sammen, ikke én og én', 'Angriperne spiller fremover på første touch'], si_til_barna: ['Press sammen', 'Snakk', 'Fremover'], category: 'spill', name: '3v3 med press i ryggen', type: 'diff', tema: 'Fart i angrep, hold overtaket', gruppe: 'To baner med småmål.', utstyr: 'Fire småmål, vester.', organisering: 'To forsvarere ved eget mål; den siste jager i press straks angriperne får ballen.', laeringsmomenter: [], link: null },
  { id: 'dex-3', se_etter: [], si_til_barna: [], category: 'spill', name: 'Vinneren står', type: 'mix', tema: 'Tempo og lite dødtid', organisering: 'To lag spiller kort 7er — ny kamp straks det er mål.', laeringsmomenter: [], link: null },
  { id: 'dex-4', se_etter: [], si_til_barna: [], category: 'sjef-over-ballen', name: 'Ferdighetssirkel', type: 'mix', tema: 'Sjef over ballen', organisering: 'Avsluttes med press.', laeringsmomenter: [], link: null },
  { id: 'dex-5', se_etter: [], si_til_barna: [], category: 'spill', name: 'Eggs (transition game)', type: 'diff', tema: null, organisering: '4v4, 3v3 eller 2v2 ut fra antall.', laeringsmomenter: [], link: { label: 'Eggs Transition Game – 4v4 til 4v3', url: 'https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3' } },
  { id: 'dex-6', se_etter: [], si_til_barna: [], category: 'oppvarming', name: 'Utvidet Barça-oppvarming', type: 'diff', tema: null, organisering: 'Innside, utside, såle, vendinger og finter med begge føtter, rundt kjegler.', laeringsmomenter: [], link: null }
]

function byName(a, b) {
  return a.name.localeCompare(b.name, 'no')
}

// Bankövelse → drill i en økts drills-JSONB. exercise_id = opphav, ikke synk.
export function exerciseToDrill(ex) {
  return {
    type: ex.type || 'none',
    text: ex.name,
    tema: ex.tema || null,
    gruppe: ex.gruppe || null,
    utstyr: ex.utstyr || null,
    organisering: ex.organisering || null,
    laeringsmomenter: [...(ex.laeringsmomenter || [])],
    se_etter: [...(ex.se_etter || [])],
    si_til_barna: [...(ex.si_til_barna || [])],
    min_spillere: ex.min_spillere ?? null,
    maks_spillere: ex.maks_spillere ?? null,
    utstyr_tags: [...(ex.utstyr_tags || [])],
    plass: ex.plass || null,
    min_alder: ex.min_alder ?? null,
    video: ex.video ? { ...ex.video } : null,
    link: ex.link ? { label: ex.link.label || '', url: ex.link.url || '' } : null,
    exercise_id: ex.id
  }
}

// Noen felt er dagens valg, ikke øvelsens egenskap. Tida er det tydeligste:
// samme rondo kan være 10 minutter på tirsdag og 20 på lørdag. De hører på
// drillen i økta, og må derfor overleve oppslaget mot banken under.
const DRILL_OWN_FIELDS = ['minutes']

// Øvelsen har én fasit, og den bor i banken. Retter du en skrivefeil der, slår
// den gjennom overalt øvelsen er i bruk. Den lagrede kopien i dagens drills er
// et sikkerhetsnett: slettes bank-raden, står planen igjen med det den hadde.
export function resolveDrills(drills, bank) {
  return (drills || []).map(d => {
    const ex = d.exercise_id ? bank.find(e => e.id === d.exercise_id) : null
    if (!ex) return d
    const resolved = exerciseToDrill(ex)
    // Uten denne blir alt øktspesifikt vasket bort hver gang siden tegnes:
    // du setter 15 min, og de er borte ved neste rendring.
    for (const k of DRILL_OWN_FIELDS) {
      if (d[k] != null) resolved[k] = d[k]
    }
    return resolved
  })
}

// Drill → payload for ny bankövelse (bokmerke-fra-økt).
export function drillToExercise(d) {
  return {
    name: d.text,
    type: d.type || 'none',
    tema: d.tema || null,
    gruppe: d.gruppe || null,
    utstyr: d.utstyr || null,
    organisering: d.organisering || null,
    laeringsmomenter: [...(d.laeringsmomenter || [])],
    se_etter: [...(d.se_etter || [])],
    si_til_barna: [...(d.si_til_barna || [])],
    min_spillere: d.min_spillere ?? null,
    maks_spillere: d.maks_spillere ?? null,
    utstyr_tags: [...(d.utstyr_tags || [])],
    plass: d.plass || null,
    min_alder: d.min_alder ?? null,
    video: d.video ? { ...d.video } : null,
    link: d.link ? { label: d.link.label || '', url: d.link.url || '' } : null
  }
}

// Kolonnen category finnes først etter at ALTER-en er kjørt i Supabase.
// Uten den: flat liste og ingen kategorivelger — appen knekker ikke.
const supportsCategory = computed(() =>
  exercises.value.length === 0 || 'category' in (exercises.value[0] || {})
)

// Samme sikring for gruppeinndelingen: kolonnen finnes først etter at
// 20260830090000_ovelse_gruppeinndeling.sql er kjørt. Uten den skal appen
// oppføre seg som før, ikke feile på hver lagring.
const supportsGruppe = computed(() =>
  exercises.value.length === 0 || 'gruppe' in (exercises.value[0] || {})
)

const supportsUtstyr = computed(() =>
  exercises.value.length === 0 || 'utstyr' in (exercises.value[0] || {})
)

// Tegnene og frasene kom i 20260904090000. Samme sikring: uten kolonnene skal
// seksjonene bare være borte, ikke velte lagringen.
const supportsSeEtter = computed(() =>
  exercises.value.length === 0 || 'se_etter' in (exercises.value[0] || {})
)

const supportsSiTilBarna = computed(() =>
  exercises.value.length === 0 || 'si_til_barna' in (exercises.value[0] || {})
)

// Nøkkeltallene kom i 20260904140000. Fem kolonner, én guard: de settes av
// samme migrasjon, så de finnes eller mangler sammen.
const supportsNokkeltall = computed(() =>
  exercises.value.length === 0 || 'min_spillere' in (exercises.value[0] || {})
)

// Videoen kom i 20260905090000. Den fylles av scripts/tiim-video.mjs fra
// tiim-lenka, ikke av treneren — så skjemaet har ikke noe felt for den, og
// guarden er bare der for at lagring ikke velter mellom deploy og migrasjon.
const supportsVideo = computed(() =>
  exercises.value.length === 0 || 'video' in (exercises.value[0] || {})
)

const NOKKELTALL_FELT = ['min_spillere', 'maks_spillere', 'utstyr_tags', 'plass', 'min_alder']

function utenUstottede(payload) {
  const p = { ...payload }
  if (!supportsGruppe.value) delete p.gruppe
  if (!supportsUtstyr.value) delete p.utstyr
  if (!supportsCategory.value) delete p.category
  if (!supportsSeEtter.value) delete p.se_etter
  if (!supportsSiTilBarna.value) delete p.si_til_barna
  if (!supportsNokkeltall.value) for (const f of NOKKELTALL_FELT) delete p[f]
  if (!supportsVideo.value) delete p.video
  return p
}

export function useExercises() {
  async function fetchExercises() {
    if (loaded.value) return exercises.value
    loading.value = true

    if (!isSupabaseConfigured) {
      exercises.value = [...DEMO_EXERCISES].sort(byName)
      loaded.value = true
      loading.value = false
      return exercises.value
    }

    // Banken deles på KLUBB — Halsens kull deler øvelser, Stag har sine.
    const { data, error } = await clubScoped(supabase
      .from('training_exercises')
      .select('*'))
      .order('name')

    // Avsenderne. Feiler den, står øvelsene uten merke — det er en etikett,
    // ikke en tilgangssjekk, og banken skal vises uansett.
    const { data: kull } = await supabase.rpc('bb_club_cohort_names')
    if (kull) kullNavn.value = Object.fromEntries(kull.map(k => [k.id, k.name]))

    if (!error && data) {
      exercises.value = data
      loaded.value = true
    } else if (error) {
      console.warn('Øvelsesbank utilgjengelig — er supabase-ovelsesbank-schema.sql kjørt?', error.message)
    }
    loading.value = false
    return exercises.value
  }

  async function createExercise(payload) {
    if (!isSupabaseConfigured) {
      const row = { id: demoId('dex'), laeringsmomenter: [], link: null, tema: null, gruppe: null, utstyr: null, organisering: null, type: 'none', ...payload }
      // DEMO_EXERCISES er demo-«databasen» — uten denne forsvinner raden ved reload.
      DEMO_EXERCISES.push(row)
      exercises.value = [...exercises.value, row].sort(byName)
      return row
    }

    const { data: row, error } = await supabase
      .from('training_exercises')
      // Kullet ditt står som avsender. Banken deles fortsatt i hele klubben —
      // `club_id` er scopet, `cohort_id` er signaturen.
      .insert(withClub({ ...utenUstottede(payload), cohort_id: cohortId() }))
      .select()
      .single()
    if (!error && row) exercises.value = [...exercises.value, row].sort(byName)
    return row
  }

  async function updateExercise(id, updates) {
    if (!isSupabaseConfigured) {
      const di = DEMO_EXERCISES.findIndex(e => e.id === id)
      if (di > -1) DEMO_EXERCISES[di] = { ...DEMO_EXERCISES[di], ...updates }
      const i = exercises.value.findIndex(e => e.id === id)
      if (i > -1) exercises.value[i] = { ...exercises.value[i], ...updates }
      exercises.value = [...exercises.value].sort(byName)
      return exercises.value.find(e => e.id === id)
    }

    const { data, error } = await supabase
      .from('training_exercises')
      .update(utenUstottede(updates))
      .eq('id', id)
      .select()
      .single()
    if (!error && data) {
      const i = exercises.value.findIndex(e => e.id === id)
      if (i > -1) exercises.value[i] = data
      exercises.value = [...exercises.value].sort(byName)
    }
    return data
  }

  async function deleteExercise(id) {
    if (!isSupabaseConfigured) {
      const di = DEMO_EXERCISES.findIndex(e => e.id === id)
      if (di > -1) DEMO_EXERCISES.splice(di, 1)
      exercises.value = exercises.value.filter(e => e.id !== id)
      return
    }

    const { data, error } = await supabase
      .from('training_exercises')
      .delete()
      .eq('id', id)
      .select('id')
    if (!error && data?.length) exercises.value = exercises.value.filter(e => e.id !== id)
  }

  function findByName(name) {
    const n = (name || '').trim().toLowerCase()
    return exercises.value.find(e => e.name.trim().toLowerCase() === n) || null
  }

  // Alle øvelser lever i banken: nye drills fanges automatisk ved opprettelse.
  // Returnerer eksisterende rad ved navnetreff, ellers opprettes en ny.
  // Kall sekvensielt — findByName ser forrige insert og deduper innen samme batch.
  async function upsertFromDrill(d) {
    const name = (d.text || '').trim()
    if (!name) return null
    await fetchExercises()
    const hit = findByName(name)
    if (hit) return hit
    return createExercise(drillToExercise(d))
  }

  // Avsenderen på en øvelse — tom for ditt eget kull. «Fra G2015» på noe du
  // selv skrev er støy; på noe et annet kull skrev er det hele poenget.
  function opphavFor(ex) {
    const id = ex?.cohort_id
    if (!id || id === cohortId()) return ''
    const navn = kullNavn.value[id]
    if (!navn) return ''
    return kortKullnavn(navn, useAuth().activeCohort.value?.club_short_name || '')
  }

  return { exercises, loading, loaded, supportsCategory, supportsGruppe, supportsUtstyr, supportsSeEtter, supportsSiTilBarna, supportsNokkeltall, supportsVideo, fetchExercises, createExercise, updateExercise, deleteExercise, findByName, upsertFromDrill, opphavFor }
}
