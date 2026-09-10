// Melder fra at appen kjører installert, ikke i en nettleserfane.
//
// Hvorfor det ikke ligger i sporing.js: den beaconen er identitetsløs med
// vilje, og tabellen den skriver til er insert-åpen. En bruker-id der kunne
// hvem som helst funnet på. Dette kallet går gjennom den innloggede klienten,
// og funksjonen i basen stempler `auth.uid()` — ingen kan melde for andre.
import { supabase } from '../supabase'

let meldt = false

// Android og desktop svarer på display-mode. iOS Safari gjør ikke det og har
// sin egen navigator.standalone. Sjekkes bare én av dem, ser iOS-brukere ut
// som nettleserbrukere.
export function kjorerSomApp() {
  try {
    return (
      window.navigator.standalone === true ||
      ['standalone', 'fullscreen', 'minimal-ui'].some(
        (m) => window.matchMedia(`(display-mode: ${m})`).matches
      )
    )
  } catch {
    return false
  }
}

export async function meldPwa() {
  if (meldt || !kjorerSomApp()) return
  meldt = true
  try {
    const { error } = await supabase.rpc('bb_meld_pwa')
    // Gikk den ikke gjennom, la neste innlogging få prøve igjen.
    if (error) meldt = false
  } catch {
    meldt = false
  }
}
