// «1 t 30 min» er slik folk snakker om det. «90 min» er slik databaser gjør.
// Én funksjon, så Hjem, Trening, Del inn og økta ikke sier det på hver sin måte.
export function varighet(min) {
  if (!min) return ''
  const t = Math.floor(min / 60)
  const m = min % 60
  if (!t) return `${m} min`
  return m ? `${t} t ${m} min` : `${t} t`
}
