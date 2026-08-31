import { supabase, isSupabaseConfigured } from '../supabase'

// Krasj fra ekte enheter, skrevet til vår egen base.
//
// Sten fant fire ting på én dag. Vi fant null. Den stille klassen — appen sier
// noe den ikke har dekning for — tar `check:writes` og tomhetssveipet i QA-en.
// Den høylytte, der noe faktisk kaster på en telefon vi ikke har, har vi
// fortsatt ingen anelse om.
//
// REGLER DENNE FILA MÅ HOLDE:
//
// 1. Den kan aldri kaste. En feilrapportør som feiler skjuler feilen den skulle
//    meldt, og verre: kaster den inne i sin egen håndterer, går den i ring.
// 2. Den kan aldri blokkere. Ingen await i en håndterer som brukeren venter på.
// 3. Den melder samme sak ÉN gang per økt. En ødelagt render-løkke skriver
//    ellers ti tusen rader og gjør tabellen ubrukelig i samme slengen.
// 4. Den tar ikke med innhold. Rute uten query, ikke props, ikke tekst fra
//    skjermen. Appen er full av navn på barn, og en stacktrace er ikke stedet.

const RELEASE = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev'
const MAKS_PER_ØKT = 20

const meldt = new Set()
let antall = 0

// Enkel, stabil hash. Ikke krypto — den skal bare gruppere.
function hash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// Fingeravtrykket er meldingen pluss ØVERSTE ramme. Ta med hele staken, og to
// kjøringer av samme feil får ulikt avtrykk så snart en linje flytter seg.
function avtrykk(message, stack) {
  const førsteRamme = String(stack || '').split('\n').find(l => /:\d+:\d+/.test(l)) || ''
  return hash(`${message}|${førsteRamme.trim().replace(/:\d+:\d+/g, '')}`)
}

async function kontekst() {
  try {
    const { useAuth } = await import('../stores/auth')
    const { activeCohort, role } = useAuth()
    return { cohort_id: activeCohort.value?.id || null, role: role.value || null }
  } catch {
    return { cohort_id: null, role: null }
  }
}

function meld(kind, message, stack) {
  try {
    if (!isSupabaseConfigured || !message) return
    if (antall >= MAKS_PER_ØKT) return

    const fingerprint = avtrykk(message, stack)
    if (meldt.has(fingerprint)) return
    meldt.add(fingerprint)
    antall++

    // Ikke await: håndtereren skal returnere med en gang. Feiler skrivingen —
    // ingen sesjon, RLS, nettet er borte — er det ingenting å gjøre med det,
    // og en feil herfra må ikke bli en ny feil.
    ;(async () => {
      const { cohort_id, role } = await kontekst()
      await supabase.from('client_errors').insert({
        kind,
        message: String(message).slice(0, 2000),
        stack: stack ? String(stack).slice(0, 8000) : null,
        // Bare stien. Query kan bære hva som helst; id-er i stien er uuid-er.
        route: location.pathname,
        release: RELEASE,
        fingerprint,
        cohort_id,
        role,
        user_agent: navigator.userAgent.slice(0, 400)
      })
    })().catch(() => {})
  } catch {
    // Med vilje tomt. Se regel 1.
  }
}

export function startErrorReporting(app) {
  window.addEventListener('error', e => {
    // Ressursfeil (bilde som ikke lastet) har ingen `error` og er ikke en krasj.
    if (!e?.error) return
    meld('error', e.error.message || String(e.message), e.error.stack)
  })

  window.addEventListener('unhandledrejection', e => {
    const r = e?.reason
    meld('unhandledrejection', r?.message || String(r), r?.stack)
  })

  if (app) {
    const forrige = app.config.errorHandler
    app.config.errorHandler = (err, instance, info) => {
      meld('vue', `${err?.message || String(err)} (${info})`, err?.stack)
      // Vue sitt eget oppsett skal fortsatt få se feilen.
      if (forrige) forrige(err, instance, info)
      else console.error(err)
    }
  }
}
