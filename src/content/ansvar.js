// Ansvarsområdene i trenerteamet, avtalt på trenermøtet 16. august 2026.
//
// Dette er ikke møtereferat — det er et stående faktum om teamet som overlever
// hvert møte. Derfor bor det for seg selv, ikke inne i et referat.
//
// Hvorfor ikke en kolonne på `coaches`: tabellen er (id, name, pin) og hentes
// med eksplisitt kolonneliste fordi select('*') en gang serverte PIN-koder til
// alle. En ny kolonne krever en migrasjon kjørt for hånd i SQL Editor, og
// betaler seg først når noen skal redigere i appen. Ingen skal det ennå.
// Koblingen mot trenerraden går på NAVN, som er UNIQUE i tabellen og allerede
// er nøkkelen COACH_IMAGES bruker i useCoaches.js.

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

// Områdene én person eier, i listas rekkefølge.
export function areasForCoach(name) {
  return ANSVAR.filter(a => a.coaches.includes(name)).map(a => a.area)
}

// «Alex og Trond». Brukes på åpne punkter i referatet, som peker på område —
// ikke på navn. Flyttes ansvaret, flytter eieren seg med.
export function ownerLabel(area) {
  const names = ANSVAR.find(a => a.area === area)?.coaches
  if (!names?.length) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} og ${names[names.length - 1]}`
}

// Gruppert per person, i den rekkefølgen navnene dukker opp i lista. Det er
// slik man slår det opp: «hva er mitt?», ikke «hvem har område nr. 6?».
export function ansvarPerPerson() {
  const rekkefolge = []
  for (const a of ANSVAR) {
    for (const name of a.coaches) {
      if (!rekkefolge.includes(name)) rekkefolge.push(name)
    }
  }
  return rekkefolge.map(name => ({ name, areas: areasForCoach(name) }))
}
