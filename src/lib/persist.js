import { watch } from 'vue'
import { cohortId } from './scope'

// Varig cache for composable-state, per kull.
//
// Composablene er modul-singletons: dataen lever så lenge fanen gjør det, og
// ikke ett sekund lenger. Hver kald start begynte derfor med tomme lister, et
// skjelett og fem–seks serielle runder mot basen før Hjem hadde noe å vise.
// På 4G er det halvannet sekund med grå bokser, hver gang appen åpnes.
//
// Nå skrives listene til localStorage når de endres, og leses inn igjen ved
// oppstart — før første tegning. Skjermen viser gårsdagens data med en gang,
// og hentingen oppdaterer på plass når svaret kommer. Det er slik en app som
// føles innfødt gjør det: vis det du vet, hent det du ikke vet.
//
// Nøkkelen bærer kull-id-en, så et kullbytte aldri viser feil kulls kamper.
// `loaded`-flagg cachees ALDRI — de er det som får hentingen til å kjøre.
// Ved utlogging tømmes alt (delt enhet: neste person skal ikke se forrige
// persons kamper i et halvsekund).

const PREFIX = 'bb:c:'
const alle = new Set()

function nokkel(key, kull) { return `${PREFIX}${key}:${kull}` }

function senere(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 1500 })
  else setTimeout(fn, 200)
}

export function persistRef(key, r, { version = 1 } = {}) {
  let forKull = null   // kullet refen er hydrert for — bare da skriver vi
  let ventende = null

  function hydrer() {
    const k = cohortId()
    forKull = k
    if (!k) return
    try {
      const raw = localStorage.getItem(nokkel(key, k))
      if (!raw) return
      const { v, d } = JSON.parse(raw)
      if (v === version && d != null) r.value = d
    } catch { /* korrupt eller full: lev uten */ }
  }

  function lagre() {
    const k = cohortId()
    if (!k || k !== forKull) return
    if (ventende) return
    ventende = senere(() => {
      ventende = null
      try {
        localStorage.setItem(nokkel(key, k), JSON.stringify({ v: version, d: r.value }))
      } catch { /* kvote: da er cachen bare kaldere */ }
    }) || true
  }

  hydrer()
  // Kullbytte: nullstillingen tømmer refen (forKull ≠ nytt kull, så det
  // skrives ikke), og så hydreres den for det nye kullet.
  watch(() => cohortId(), k => { if (k !== forKull) hydrer() })
  watch(r, lagre, { deep: true })
  alle.add(key)
  return r
}

// Ved utlogging: alt vekk, for alle kull.
export function clearPersisted() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch { /* ok */ }
}
