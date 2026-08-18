// Ansvarsområdene i trenerteamet, avtalt på trenermøtet 16. august 2026.
//
// Fila er nå TO ting, og bare den ene er data:
//
//   1. AREAS — den kanoniske lista over områder. Den blir stående i kode som
//      forslag i velgeren, på samme måte som EXERCISE_CATEGORIES i
//      useExercises.js. Et nytt område skal ikke koste en migrasjon.
//   2. ANSVAR — fordelingen slik den var da referatet ble skrevet. Etter
//      migrasjonen 20260818090000 er fasiten `coach_responsibilities` i basen;
//      denne står igjen som seed og som fallback for demo-modus.
//
// Fordelingen leses gjennom useResponsibilities, aldri herfra direkte.

export const AREAS = [
  'Cuper',
  'Kommunikasjon',
  'Keepertrener',
  'Dommere',
  'Rigg og Hoopit',
  'Materiell og vester',
  'Treningsopplegg og øvelser',
  'Oppvarming'
]

export const ANSVAR = [
  { area: 'Cuper', coaches: ['Alex', 'Trond'] },
  { area: 'Kommunikasjon', coaches: ['Trond'] },
  { area: 'Keepertrener', coaches: ['Trond'] },
  { area: 'Dommere', coaches: ['Alex'] },
  { area: 'Rigg og Hoopit', coaches: ['Simon'] },
  { area: 'Materiell og vester', coaches: ['Jacob'] },
  { area: 'Treningsopplegg og øvelser', coaches: ['Iver'] },
  { area: 'Oppvarming', coaches: ['Iver'] }
]

// Områdene én person eier i seed-fordelingen. Navnekoblingen lever bare her —
// i basen er nøkkelen coach_id.
export function seedAreasForName(name) {
  return ANSVAR.filter(a => a.coaches.includes(name)).map(a => a.area)
}

// «Alex og Trond» — brukes på åpne punkter i referatet.
export function joinNames(names) {
  if (!names?.length) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} og ${names[names.length - 1]}`
}

// Områder i kanonisk rekkefølge, med ukjente (lagt til senere) bakerst.
export function sortAreas(areas) {
  return [...(areas || [])].sort((a, b) => {
    const ia = AREAS.indexOf(a)
    const ib = AREAS.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
}
