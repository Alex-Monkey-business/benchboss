// Én klokke for alt som følges mens en skjerm står åpen (Del inn, økta).
//
// Før gikk Del inn på to tidtakere — 4 s for raden og 5 s for økta — som
// vekket radioen hver for seg, hele tiden, også når ingenting skjedde. Nå går
// alle hentingene i samme runde. Har tre runder på rad ikke endret noe, går
// klokka ned til hvert 10. sekund — ikke lenger, for en endring fra en annen
// trener skal fortsatt stå der innen et blikk. En endring her (raskIgjen), en
// endring fra en annen telefon, at appen kommer fram igjen eller at nettet
// kommer tilbake, gir fart.
//
// En oppgave er en funksjon som henter og svarer true når noe endret seg.

const RASK_MS = 4000
const ROLIG_MS = 10000
const ROLIGE_RUNDER = 3

const oppgaver = new Map()
let timer = null
let kjorer = false
let rolige = 0

function planlegg() {
  clearTimeout(timer)
  timer = null
  if (!oppgaver.size || kjorer) return
  timer = setTimeout(runde, rolige >= ROLIGE_RUNDER ? ROLIG_MS : RASK_MS)
}

async function runde() {
  timer = null
  if (kjorer) return
  if (document.visibilityState !== 'visible') return planlegg()
  kjorer = true
  try {
    const svar = await Promise.all([...oppgaver.values()].map(f => Promise.resolve().then(f).catch(() => false)))
    rolige = svar.some(Boolean) ? 0 : rolige + 1
  } finally {
    kjorer = false
    planlegg()
  }
}

function synlig() {
  if (document.visibilityState !== 'visible') return
  rolige = 0
  runde()
}

// Følg med `fn` til stopp-funksjonen kalles. Samme navn erstatter.
export function folgMed(navn, fn) {
  const forste = !oppgaver.size
  oppgaver.set(navn, fn)
  if (forste) {
    document.addEventListener('visibilitychange', synlig)
    // Nettet kom tilbake: hent med en gang, ikke om ti sekunder.
    window.addEventListener('online', synlig)
  }
  rolige = 0
  if (!timer && !kjorer) planlegg()
  return () => {
    if (oppgaver.get(navn) !== fn) return
    oppgaver.delete(navn)
    if (oppgaver.size) return
    clearTimeout(timer)
    timer = null
    rolige = 0
    document.removeEventListener('visibilitychange', synlig)
    window.removeEventListener('online', synlig)
  }
}

// Noe ble endret her: tilbake til rask takt, regnet fra nå.
export function raskIgjen() {
  rolige = 0
  if (!kjorer) planlegg()
}
