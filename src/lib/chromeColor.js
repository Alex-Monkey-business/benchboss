// Fargen på nettleserens ramme (statuslinja i PWA-en, adressefeltet i Chrome)
// skal være appens bakgrunn — ikke en verdi som lever sitt eget liv i en meta-tag.
// Vi leser derfor `--ds-color-bg` slik den faktisk er beregnet for gjeldende
// tema OG design, i stedet for å gjenta hex-koder fra token-filene her.
export function syncChromeColor() {
  if (typeof document === 'undefined') return
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) return
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--ds-color-bg').trim()
  if (bg) {
    meta.setAttribute('content', bg)
  } else {
    // CSS-en er ikke lest ennå (dev-server injiserer den etter oss). Prøv igjen ved neste frame.
    requestAnimationFrame(syncChromeColor)
  }
}
