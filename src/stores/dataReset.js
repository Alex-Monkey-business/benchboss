// Composablene er modul-scope singletons: dataen lever så lenge fanen gjør det,
// uavhengig av hvem som er logget inn. På en delt enhet betyr det at neste
// person ser forrige persons kamper og utlegg — og fordi `loaded`-flaggene
// står igjen som true, henter ingenting på nytt.
//
// Hver composable med brukerdata registrerer en nullstiller her. Kalles ved
// utlogging og ved bytte av bruker.
const resetters = new Set()

export function registerReset(fn) {
  resetters.add(fn)
  return fn
}

export function resetAllData() {
  for (const fn of resetters) {
    try {
      fn()
    } catch (e) {
      console.warn('[dataReset] nullstilling feilet', e)
    }
  }
}
