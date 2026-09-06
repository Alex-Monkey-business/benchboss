import { PostgrestClient } from '@supabase/postgrest-js'
import { GoTrueClient } from '@supabase/auth-js'
import { FunctionsClient } from '@supabase/functions-js'

// En slank Supabase-klient: bare det appen bruker.
//
// `createClient` fra supabase-js drar med realtime (websockets) og storage —
// rundt en fjerdedel av all JS appen laster ved kald start, for to ting appen
// aldri kaller. De kan ikke tre-shakes vekk, for klienten instansierer dem i
// konstruktøren. Så vi setter sammen klienten selv av de tre delene vi bruker:
// postgrest (from/rpc), auth og functions. Skriptene i scripts/ bruker
// fortsatt supabase-js — det er bare appen som er slanket.
//
// Oppførselen speiler supabase-js 2.99 nøyaktig der det betyr noe:
// - storageKey er `sb-<prosjektref>-auth-token`, samme som før. En annen nøkkel
//   hadde logget ut alle ved neste deploy.
// - Hver REST-forespørsel får brukerens access token (eller anon-nøkkelen) i
//   Authorization, og apikey-headeren. Det er dette RLS ser.
//
// flowType: 'implicit' er et bevisst valg, ikke en default.
//
// Med PKCE ligger code-verifier i localStorage til nettleseren som STARTET
// forespørselen. En magic link åpnet i en annen nettleser feiler da med en
// ugjennomtrengelig feil — og det er nøyaktig det som skjer på iOS, der en
// lenke fra e-post åpnes i Safari mens appen er installert som PWA.
//
// Prisen: tokenene havner i URL-fragmentet, og dermed i historikken.
// AuthCallbackView rydder fragmentet så snart sesjonen er lest.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function lagKlient(url, key) {
  const base = new URL(url)
  const storageKey = `sb-${base.hostname.split('.')[0]}-auth-token`

  const auth = new GoTrueClient({
    url: new URL('auth/v1', base).href,
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    storageKey,
    flowType: 'implicit',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true
  })

  async function accessToken() {
    const { data } = await auth.getSession()
    return data?.session?.access_token ?? key
  }

  // Samme som supabase-js' fetchWithAuth: apikey alltid, Authorization med
  // brukerens token hvis kalleren ikke har satt en selv.
  async function fetchWithAuth(input, init = {}) {
    const headers = new Headers(init.headers)
    if (!headers.has('apikey')) headers.set('apikey', key)
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${await accessToken()}`)
    return fetch(input, { ...init, headers })
  }

  const rest = new PostgrestClient(new URL('rest/v1', base).href, {
    headers: {},
    schema: 'public',
    fetch: fetchWithAuth
  })

  const functionsUrl = new URL('functions/v1', base).href

  return {
    auth,
    from: relation => rest.from(relation),
    rpc: (fn, args, options) => rest.rpc(fn, args, options),
    get functions() {
      return new FunctionsClient(functionsUrl, { headers: {}, customFetch: fetchWithAuth })
    }
  }
}

export const supabase = supabaseUrl && supabaseKey ? lagKlient(supabaseUrl, supabaseKey) : null

export const isSupabaseConfigured = !!supabase
