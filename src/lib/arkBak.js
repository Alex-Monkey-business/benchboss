// Siden bak et stort ark trekker seg litt innover og får runde hjørner, som
// et kort som legges bakerst i bunken.
//
// Appen kan ikke bare skaleres der den står: da ville faste ting (bunnmenyen,
// faste knapper) regne plassen sin fra hele sidens høyde og hoppe ut av
// bildet. Derfor gjøres skallet først om til en flate som er akkurat like
// stor som skjermen, med innholdet trukket opp like langt som siden var
// scrollet. Det ser helt likt ut. Så skaleres den flata.
//
// Telles, som scroll-låsen: et ark som åpner et ark til er to.

let antall = 0
let rydd = null
let etterpa = null // det som skal skje når flata er lagt tilbake (slippe scroll-låsen)

const skall = () => document.querySelector('.app-layout')
const rolig = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function leggTilbake() {
  clearTimeout(rydd)
  rydd = null
  const rot = document.documentElement
  rot.classList.remove('ark-bak', 'ark-bak--inne')
  rot.style.removeProperty('--bak-y')
  const f = etterpa
  etterpa = null
  f?.()
}

export function bakInn() {
  if (typeof document === 'undefined' || rolig() || !skall()) return false
  // Et ark åpnes mens forrige glir ut: gjør forrige ferdig først, så
  // scroll-låsen og målene stemmer.
  if (rydd) leggTilbake()
  antall++
  if (antall > 1) return true
  const rot = document.documentElement
  // Scroll-låsen har alt festet body på -scrollY.
  const y = Math.abs(parseFloat(document.body.style.top) || 0)
  rot.style.setProperty('--bak-y', `${y}px`)
  rot.classList.add('ark-bak')
  // Neste bilde: da er flata på plass, og skaleringen kan gli.
  // (Tidsur, ikke requestAnimationFrame: den står stille i en fane i bakgrunnen.)
  setTimeout(() => { if (antall > 0 && !rydd) rot.classList.add('ark-bak--inne') }, 30)
  return true
}

// `ferdig` kjøres når flata er lagt tilbake. Scroll-låsen må slippes først
// da: mens skallet er en fast flate, har siden ingen høyde å scrolle til.
export function bakUt(ferdig) {
  if (typeof document === 'undefined' || antall === 0) { ferdig?.(); return }
  antall--
  if (antall > 0) { ferdig?.(); return }
  etterpa = ferdig || null
  document.documentElement.classList.remove('ark-bak--inne')
  rydd = setTimeout(leggTilbake, 320)
}
