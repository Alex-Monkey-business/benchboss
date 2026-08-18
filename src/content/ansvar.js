// Ansvarsområdene i trenerteamet.
//
// Fila er TO ting, og bare den ene er data:
//
//   1. AREAS — den kanoniske lista over områder, med én linje som sier hva
//      jobben faktisk er. Den blir stående i kode, på samme måte som
//      EXERCISE_CATEGORIES i useExercises.js. Et nytt område skal ikke koste
//      en migrasjon, og forklaringen skal ikke koste en kolonne.
//   2. ANSVAR — fordelingen, som seed til basen og som fallback i demo-modus.
//      Fasiten er `coach_responsibilities`; den leses gjennom
//      useResponsibilities, aldri herfra direkte.
//
// Rekkefølgen er ikke tilfeldig: den styrer sorteringen både av områder på en
// trener og av personer i ansvarsoversikten. Headcoach først er med vilje.

export const AREAS = [
  { name: 'Headcoach', note: 'Siste ord ved uenighet' },
  { name: 'Kommunikasjon', note: 'Det foreldrene får vite' },
  { name: 'Cup', note: 'Påmelding, betaling, kjøring' },
  { name: 'Tech', note: 'BenchBoss og alt som blinker' },
  { name: 'Øvelser', note: 'Ukas plan og banken' },
  { name: 'Dommere', note: 'Skaffer dommer og legger ut' },
  { name: 'Rigg og Hoopit', note: 'Baner opp, oppmøte inn' },
  { name: 'Materialforvalter', note: 'Baller, vester og kjegler — og at de kommer hjem igjen' }
]

export const AREA_NAMES = AREAS.map(a => a.name)

export function areaNote(name) {
  return AREAS.find(a => a.name === name)?.note || ''
}

export const ANSVAR = [
  { area: 'Headcoach', coaches: ['Trond'] },
  { area: 'Kommunikasjon', coaches: ['Trond'] },
  { area: 'Cup', coaches: ['Alex'] },
  { area: 'Tech', coaches: ['Alex'] },
  { area: 'Øvelser', coaches: ['Iver'] },
  { area: 'Dommere', coaches: ['Iver'] },
  { area: 'Rigg og Hoopit', coaches: ['Simon'] },
  { area: 'Materialforvalter', coaches: ['Jacob'] }
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
    const ia = AREA_NAMES.indexOf(a)
    const ib = AREA_NAMES.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
}
