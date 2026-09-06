// Composablene skiller i dag ikke mellom «ingen rader» og «spørringen feilet»
// — begge ender som en tom liste, og `loaded` settes til true uansett. Når
// RLS kommer, blir «du har ikke tilgang» også en tom liste uten feil. Da
// rendrer views tom-tilstander som lyver.
//
// fetchRows returnerer null-rader ved feil, slik at kalleren kan holde
// status: 'error' og la UI-et si «kunne ikke laste» i stedet for «ingenting her».

export const STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  OK: 'ok',
  ERROR: 'error'
}

// Én forespørsel om gangen per henter. Hjem og bunnmenyen ba om cups og
// seriestatus i samme millisekund, og begge gikk til basen. Med denne deler
// de svaret. Argumentene er nøkkelen, så fetchMatches(a) og fetchMatches(b)
// er to ulike forespørsler.
//
// `name` gjør registeret delt på tvers av composable-kall: useCups() lager en
// ny fetchCups hver gang den kalles, men alle deler samme pågående henting.
const delt = new Map()
export function dedupe(fn, name = null) {
  const inflight = name ? delt : new Map()
  return (...args) => {
    const k = (name || '') + '|' + JSON.stringify(args)
    if (inflight.has(k)) return inflight.get(k)
    const p = Promise.resolve().then(() => fn(...args)).finally(() => inflight.delete(k))
    inflight.set(k, p)
    return p
  }
}

export async function fetchRows(builder, label) {
  const { data, error } = await builder
  if (error) {
    console.warn('[query]', label, error.code || '', error.message)
    return { rows: null, error }
  }
  return { rows: data ?? [], error: null }
}
