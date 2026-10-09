// Tilbake lukker det øverste laget først — som i en app.
//
// På Android er tilbake-knappen (og sveipen fra kanten) det første folk
// trykker for å lukke et ark. Uten dette forlot den hele siden, med arket
// åpent. Nå får hvert åpent lag (ark, dialog) sin egen oppføring i
// historikken, og tilbake lukker laget i stedet for å navigere.
//
// Oppføringen har samme adresse som siden, så ruteren ser ingen ny side.
// Lukkes laget med krysset, et trykk utenfor eller dra-ned, tar vi selv
// oppføringen ut igjen (history.back), så neste tilbake går dit den skal.
//
// Et lag kan si «ikke lukk meg, men gå ett steg tilbake inni meg» (tilbake()
// returnerer true): fra «Om øvelsen» tilbake til gruppene, ikke ut av arket.

const stabel = []
let ignorer = 0
let lytter = false
let venter = []

function påPop() {
  if (ignorer > 0) {
    ignorer--
    if (!ignorer) { venter.forEach(f => f()); venter = [] }
    return
  }
  const topp = stabel[stabel.length - 1]
  if (!topp) return
  if (topp.tilbake && topp.tilbake()) {
    // Laget tok imot steget selv; legg oppføringen tilbake så det kan skje igjen.
    history.pushState({ ...history.state }, '')
    return
  }
  stabel.pop()
  topp.poppet = true
  topp.lukk()
}

export function registrerLag(lukk, tilbake = null) {
  if (typeof window === 'undefined') return () => {}
  if (!lytter) { window.addEventListener('popstate', påPop); lytter = true }
  history.pushState({ ...history.state }, '')
  const lag = { lukk, tilbake, poppet: false }
  stabel.push(lag)

  // viaNavigasjon: laget forsvinner fordi siden byttes (en lenke i arket).
  // Da står ruterens nye oppføring øverst, og den skal vi ikke ta bort.
  return function fjern({ viaNavigasjon = false } = {}) {
    const i = stabel.indexOf(lag)
    if (i > -1) stabel.splice(i, 1)
    if (lag.poppet || viaNavigasjon) return
    lag.poppet = true
    ignorer++
    history.back()
  }
}

// Lukk et lag og naviger videre: vent til lagets oppføring er tatt ut av
// historikken først. Ellers ligger den igjen under den nye siden, og
// tilbake derfra lander på et dødt steg.
export function naarRolig() {
  if (!ignorer) return Promise.resolve()
  return new Promise(r => venter.push(r))
}
