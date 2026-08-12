import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// flowType: 'implicit' er et bevisst valg, ikke en default.
//
// Med PKCE ligger code-verifier i localStorage til nettleseren som STARTET
// forespørselen. En magic link åpnet i en annen nettleser feiler da med en
// ugjennomtrengelig feil — og det er nøyaktig det som skjer på iOS, der en
// lenke fra e-post åpnes i Safari mens appen er installert som PWA.
//
// Prisen: tokenene havner i URL-fragmentet, og dermed i historikken.
// AuthCallbackView rydder fragmentet så snart sesjonen er lest.
export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        flowType: 'implicit',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null

export const isSupabaseConfigured = !!supabase
