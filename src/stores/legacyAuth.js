import { ref } from 'vue'

// Broen fra PIN-innlogging til Supabase Auth.
//
// Poenget er at overgangen skal kunne skrus AV uten en deploy. `version.json`
// emittes av vite-pluginen ved build, men filen ligger som en vanlig fil på
// Netlify — så hvis lørdagen går skeis er tilbakerullingen én filredigering i
// Netlify-UI-et, ikke fem minutter med byggekø. useVersionCheck poller den
// allerede hvert 60. sekund.
//
// Byggverdien er defaulten. version.json kan bare overstyre den nedover i
// praksis: står den til false, er broen stengt til neste deploy.

const CACHE_KEY = 'bb_legacy_auth'
const LEGACY_USER_KEY = 'halsen_coach'

// Varm start må avgjøres synkront — et nettverkskall her ville gitt et glimt
// av login-skjermen for alle som fortsatt er på PIN.
const cached = localStorage.getItem(CACHE_KEY)
export const legacyEnabled = ref(cached === null ? __LEGACY_AUTH__ : cached === 'true')

export async function refreshLegacyFlag() {
  try {
    const r = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' })
    if (!r.ok) return
    const { legacyAuth } = await r.json()
    if (typeof legacyAuth !== 'boolean') return
    legacyEnabled.value = legacyAuth
    localStorage.setItem(CACHE_KEY, String(legacyAuth))
  } catch {
    // Nettverket er nede. Da beholder vi forrige kjente verdi — å stenge
    // broen fordi en fetch feilet ville logget ut hele laget på en bane med
    // dårlig dekning.
  }
}

// { id, name, role } fra den gamle PIN-innloggingen. id er coaches.id, som er
// nøyaktig det den nye storen også eksponerer — derfor kan kallstedene være
// uendret gjennom hele overgangen.
export function readLegacyUser() {
  if (!legacyEnabled.value) return null
  try {
    const u = JSON.parse(localStorage.getItem(LEGACY_USER_KEY) || 'null')
    if (!u || !u.name) return null
    return { id: u.id || null, name: u.name, role: u.role || 'coach' }
  } catch {
    return null
  }
}

export function clearLegacyUser() {
  localStorage.removeItem(LEGACY_USER_KEY)
}
