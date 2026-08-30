import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '../supabase'
import { registerReset } from '../stores/dataReset'
import { ANSVAR, seedAreasForName, joinNames, sortAreas } from '../content/ansvar'

// Ansvarsområder — hvem eier hva i trenerteamet.
//
// Fasiten er `coach_responsibilities` i basen. Nøkkelen er coach_id, ikke navn:
// derfor er `Jakob` mot `Jacob` ikke lenger noe som kan gå galt her.
//
// Fila (content/ansvar.js) er fortsatt kilden i to tilfeller, og bare to:
//   - demo-modus, der det ikke finnes noen base
//   - tabellen mangler fordi migrasjonen ikke er kjørt ennå
// Er tabellen der og TOM, er tom det riktige svaret — da har noen fjernet alt
// med vilje, og fila skal ikke gjenopplive det.

const rows = ref([])
const loaded = ref(false)
const loadedCohort = ref(null)
// Finnes tabellen? Uten den skal flata vise ansvar, men ikke tilby redigering —
// samme guard-idé som supportsDuration/supportsCategory. Det er den som gjør at
// deploy og migrasjon kan komme i vilkårlig rekkefølge.
const supported = ref(true)

registerReset(() => {
  rows.value = []
  loaded.value = false
  loadedCohort.value = null
  supported.value = true
})

// Seed-fordelingen oversatt til rader, slik at resten av koden kun forholder
// seg til én form uansett hvor dataene kom fra.
function seedRows(cohortId, coaches) {
  return coaches.flatMap(c =>
    seedAreasForName(c.name).map(area => ({ id: `seed-${c.id}-${area}`, cohort_id: cohortId, coach_id: c.id, area }))
  )
}

export function useResponsibilities() {
  const supportsResponsibilities = computed(() => supported.value)

  async function fetchResponsibilities(cohortId, coaches = []) {
    if (loaded.value && loadedCohort.value === cohortId) return rows.value

    if (!isSupabaseConfigured) {
      // Demo: fila er «databasen». Endringer lever i minnet gjennom økta,
      // som DEMO_*-arrayene ellers i appen.
      if (!rows.value.length) rows.value = seedRows(cohortId, coaches)
      loaded.value = true
      loadedCohort.value = cohortId
      return rows.value
    }

    const { data, error } = await supabase
      .from('coach_responsibilities')
      .select('id, cohort_id, coach_id, area')
      .eq('cohort_id', cohortId)

    if (error) {
      console.warn('Ansvarsområder utilgjengelig — er 20260818090000_coach_responsibilities.sql kjørt?', error.message)
      supported.value = false
      rows.value = seedRows(cohortId, coaches)
      loaded.value = true
      loadedCohort.value = cohortId
      return rows.value
    }

    supported.value = true
    rows.value = data || []
    loaded.value = true
    loadedCohort.value = cohortId
    return rows.value
  }

  function areasForCoach(coachId) {
    return sortAreas(rows.value.filter(r => r.coach_id === coachId).map(r => r.area))
  }

  function ownersForArea(area, coaches = []) {
    const ids = new Set(rows.value.filter(r => r.area === area).map(r => r.coach_id))
    return coaches.filter(c => ids.has(c.id)).map(c => c.name)
  }

  // «Alex og Trond». Eies området av ingen, sier vi hva området HETER i stedet
  // for ingenting — et åpent punkt uten eier skal ikke lyde «ÅPEN ·».
  function ownerLabel(area, coaches = []) {
    return joinNames(ownersForArea(area, coaches)) || area || ''
  }

  // Gruppert per person, i den rekkefølgen navnene dukker opp i den kanoniske
  // lista. Personer uten ansvar tas ikke med — dette er en ansvarsoversikt,
  // ikke en trenerliste.
  function byPerson(coaches = []) {
    return coaches
      .map(c => ({ ...c, areas: areasForCoach(c.id) }))
      .filter(c => c.areas.length)
      .sort((a, b) => {
        const first = x => ANSVAR.findIndex(v => v.area === x.areas[0])
        return first(a) - first(b)
      })
  }

  // Erstatter hele settet for én trener. Diff i stedet for slett-og-sett-inn:
  // uendrede rader beholder id og created_at, så «hvem fikk dette når» ikke
  // nullstilles hver gang noen huker av et nytt område.
  async function setAreasForCoach(coachId, cohortId, next) {
    const ønsket = new Set(next)
    const nåværende = rows.value.filter(r => r.coach_id === coachId)
    const fjernes = nåværende.filter(r => !ønsket.has(r.area))
    const legges = [...ønsket].filter(a => !nåværende.some(r => r.area === a))

    if (!isSupabaseConfigured || !supported.value) {
      rows.value = [
        ...rows.value.filter(r => r.coach_id !== coachId),
        ...[...ønsket].map(area => ({ id: `demo-${coachId}-${area}`, cohort_id: cohortId, coach_id: coachId, area }))
      ]
      return rows.value
    }

    if (fjernes.length) {
      const { data, error } = await supabase
        .from('coach_responsibilities')
        .delete()
        .in('id', fjernes.map(r => r.id))
        .select('id')
      if (error) return null
      // Radene kom fra rows.value, så de finnes. Null tilbake betyr nektet.
      if (!data?.length) return null
      rows.value = rows.value.filter(r => !fjernes.some(f => f.id === r.id))
    }

    if (legges.length) {
      const { data, error } = await supabase
        .from('coach_responsibilities')
        .insert(legges.map(area => ({ cohort_id: cohortId, coach_id: coachId, area })))
        .select('id, cohort_id, coach_id, area')
      if (error) return null
      rows.value = [...rows.value, ...(data || [])]
    }

    return rows.value
  }

  return {
    responsibilities: rows,
    supportsResponsibilities,
    fetchResponsibilities,
    areasForCoach,
    ownersForArea,
    ownerLabel,
    byPerson,
    setAreasForCoach
  }
}
