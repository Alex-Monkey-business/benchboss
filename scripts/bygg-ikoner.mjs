// Lager src/lib/ikoner.js fra Phosphor (devDependency @phosphor-icons/core).
// Bare ikonene i lista, i to vekter, så appen ikke drar med seg hele settet.
// Nytt ikon: legg det til her og kjør `node scripts/bygg-ikoner.mjs`.
import { readFileSync, writeFileSync } from 'node:fs'

const IKONER = {
  'pil-hoyre': 'caret-right', 'pil-venstre': 'caret-left', 'pil-ned': 'caret-down', 'pil-opp': 'caret-up',
  pluss: 'plus', minus: 'minus', hake: 'check', kryss: 'x',
  videre: 'arrow-right', ned: 'arrow-down', slett: 'trash', rediger: 'pencil-simple',
  person: 'user', personer: 'users', drakt: 't-shirt', ball: 'soccer-ball',
  hjem: 'house', kalender: 'calendar-blank', kjegle: 'traffic-cone', statistikk: 'chart-bar',
  pokal: 'trophy', innstillinger: 'gear', 'logg-ut': 'sign-out',
  lenke: 'link', del: 'export', 'last-ned': 'download-simple', telefon: 'phone', melding: 'chat-circle',
  feil: 'x-circle', varsel: 'warning-circle', 'hake-sirkel': 'check-circle', sirkel: 'circle', tommel: 'thumbs-up',
  angre: 'arrow-counter-clockwise', bland: 'shuffle', mer: 'dots-three', spill: 'play', klokke: 'clock'
}

const rot = new URL('../node_modules/@phosphor-icons/core/assets/', import.meta.url)
function innhold(vekt, fil) {
  const navn = vekt === 'regular' ? fil : `${fil}-${vekt}`
  const svg = readFileSync(new URL(`${vekt}/${navn}.svg`, rot), 'utf8')
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<rect width="256" height="256" fill="none"\/>/, '')
}

const ut = {}
for (const [navn, fil] of Object.entries(IKONER)) ut[navn] = { regular: innhold('regular', fil), bold: innhold('bold', fil) }

writeFileSync(new URL('../src/lib/ikoner.js', import.meta.url),
  `// Laget av scripts/bygg-ikoner.mjs. Ikke rediger for hånd.\nexport const IKONER = ${JSON.stringify(ut, null, 1)}\n`)
console.log(Object.keys(ut).length, 'ikoner')
