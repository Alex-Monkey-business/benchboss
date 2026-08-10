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

export async function fetchRows(builder, label) {
  const { data, error } = await builder
  if (error) {
    console.warn('[query]', label, error.code || '', error.message)
    return { rows: null, error }
  }
  return { rows: data ?? [], error: null }
}
