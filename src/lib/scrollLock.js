// Siden bak et ark eller en dialog skal stå stille.
//
// Uten dette scrollet siden bak arket: dra i et ark som allerede står i
// bunnen, og bevegelsen går videre til siden under (scroll chaining). På iOS
// hjelper ikke `overflow: hidden` på body — Safari scroller den likevel. Det
// som virker overalt er å feste body med `position: fixed` på der den står,
// og legge scrollen tilbake når låsen slippes.
//
// Telles: et ark som åpner en bekreftelsesdialog er to låser. Siden slippes
// først når den siste lukkes.

let antall = 0
let lagretY = 0

export function laasScroll() {
  if (typeof document === 'undefined') return
  antall++
  if (antall > 1) return
  lagretY = window.scrollY
  const b = document.body
  b.style.position = 'fixed'
  b.style.top = `-${lagretY}px`
  b.style.left = '0'
  b.style.right = '0'
  b.style.width = '100%'
  b.style.overflow = 'hidden'
}

export function slippScroll() {
  if (typeof document === 'undefined' || antall === 0) return
  antall--
  if (antall > 0) return
  const b = document.body
  b.style.position = ''
  b.style.top = ''
  b.style.left = ''
  b.style.right = ''
  b.style.width = ''
  b.style.overflow = ''
  window.scrollTo(0, lagretY)
}
