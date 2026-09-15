// Alle merkefiler ut fra ÉN kilde: public/brand/bench-boss-wordmark.png.
//
// Den fila er en ren alfamaske — bokstavformene ligger i alfakanalen, ingen
// farge og ingen papirbakgrunn. Fargen settes her, med feFlood + feComposite
// «in»: fyll flaten med blekket, behold det bare der masken er ugjennomsiktig.
// Derfor finnes ordmerket i én fil i stedet for én per tema og palett.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = new URL('../', import.meta.url)
const out = new URL('output/branding/benchboss-text-only/', root)
await mkdir(out, { recursive: true })

const INK = '#1A1A1A'      // Vast Ink
const CREAM = '#FFFFEB'    // Lumen Cream
const W = 1123, H = 600    // ordmerkets egne mål

const maske = (await readFile(new URL('public/brand/bench-boss-wordmark.png', root))).toString('base64')

const ordmerke = (farge) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`
  + `<defs><filter id="ink" color-interpolation-filters="sRGB">`
  + `<feFlood flood-color="${farge}" result="f"/>`
  + `<feComposite in="f" in2="SourceGraphic" operator="in"/>`
  + `</filter></defs>`
  + `<image href="data:image/png;base64,${maske}" width="${W}" height="${H}" filter="url(#ink)"/></svg>`

// Maskable trenger 20 % trygg sone: Android beskjærer ikonet til en sirkel.
const ikon = (dark = false, maskable = false) => {
  const w = maskable ? 330 : 400
  const h = Math.round(w * H / W)
  const indre = ordmerke(dark ? CREAM : INK).replace(/^<svg[^>]*>|<\/svg>$/g, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">`
    + `<rect width="512" height="512" fill="${dark ? INK : CREAM}"/>`
    + `<svg x="${(512 - w) / 2}" y="${(512 - h) / 2}" width="${w}" height="${h}" viewBox="0 0 ${W} ${H}">${indre}</svg></svg>`
}

const favicon = await readFile(new URL('public/brand/bench-boss-favicon.svg', root), 'utf8')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ deviceScaleFactor: 1 })
async function render(name, svg, width, height = width) {
  await page.setViewportSize({ width, height })
  await page.setContent(`<style>html,body{margin:0;background:transparent}body>svg{display:block;width:100%;height:100%}</style>${svg}`)
  await page.waitForFunction(() => Array.from(document.querySelectorAll('image')).every(el => el.href.baseVal.startsWith('data:')))
  await page.waitForTimeout(150)
  await page.screenshot({ path: fileURLToPath(new URL(name, out)), omitBackground: true })
}

for (const dark of [false, true]) {
  const navn = `benchboss-logo-${dark ? 'dark' : 'light'}`
  await writeFile(new URL(`${navn}.svg`, out), ordmerke(dark ? CREAM : INK))
  await render(`${navn}.png`, ordmerke(dark ? CREAM : INK), W, H)
  await render(`benchboss-app-${dark ? 'dark' : 'cream'}-1024.png`, ikon(dark), 1024)
}

await render('benchboss-google-120.png', ikon(), 120)
await render('benchboss-google-512.png', ikon(), 512)

for (const size of [180, 192, 512]) {
  await render(`icon-${size}.png`, ikon(), size)
  await copyFile(new URL(`icon-${size}.png`, out), new URL(`public/icons/icon-${size}.png`, root))
}
await render('icon-maskable-512.png', ikon(false, true), 512)
await copyFile(new URL('icon-maskable-512.png', out), new URL('public/icons/icon-maskable-512.png', root))

// Favikonet er godkjent som det er og lages ikke om — bare rastret på nytt.
for (const size of [16, 32, 48]) {
  await render(`favicon-${size}.png`, favicon, size)
  await copyFile(new URL(`favicon-${size}.png`, out), new URL(`public/icons/favicon-${size}.png`, root))
}

await writeFile(new URL('public/brand/bench-boss-mark.svg', root), ikon())
await writeFile(new URL('public/brand/bench-boss-logo.svg', root), ordmerke(INK))
await writeFile(new URL('public/brand/bench-boss-logo-dark.svg', root), ordmerke(CREAM))

await browser.close()
console.log('Eksporterte ordmerke, Google-bilder, appikoner og favikoner.')
