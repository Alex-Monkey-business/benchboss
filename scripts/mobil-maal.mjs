import { chromium } from 'playwright'

const APP = 'http://localhost:5173'
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const STAG = '30064ef2-2a5d-4f62-aea9-3cf9a1f18726'
const BREDDER = [320, 344, 360, 375, 390, 393, 414, 430]

// Realistisk liste: lange norske navn, draktnummer, punktliste, overskrift.
const LISTE = `Spillere
1. Aleksander Kristoffersen 7
2. Kristoffer-Emil Bakkevold-Sæther 12
Nordmann, Ola
Mathilde Andrea Gulbrandsen (9)
Per Hansen, Nils Berg, Åsmund Ødegård
Sigurd Trygvasson Halvorsen #3
Emil Nikolai Aabakken`

const link = await (await fetch('http://127.0.0.1:54321/auth/v1/admin/generate_link', {
  method: 'POST',
  headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', email: 'alexander.samnoy@gmail.com' })
})).json()

const browser = await chromium.launch()

// Logg inn én gang, gjenbruk sesjonen på alle bredder.
const boot = await browser.newContext({ viewport: { width: 390, height: 844 } })
const bp = await boot.newPage()
await bp.goto(link.action_link, { waitUntil: 'networkidle' })
await bp.evaluate(id => localStorage.setItem('bb_active_cohort', id), STAG)
await bp.goto(APP + '/', { waitUntil: 'networkidle' })
const state = await boot.storageState()
await boot.close()

const rapport = []

for (const width of BREDDER) {
  // Høyden er med tastatur oppe: ~844 blir ~440 synlig på en iPhone.
  for (const [merke, height] of [['full', 844], ['tastatur', 440]]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      storageState: state,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    })
    const page = await ctx.newPage()
    await page.goto(APP + '/', { waitUntil: 'networkidle' })

    const kort = page.getByRole('button', { name: /Legg inn spillerne/ })
    if (!(await kort.count())) { console.log(`${width}x${height}: fant ikke spillerkortet`); await ctx.close(); continue }
    await kort.click()
    await page.locator('#onb-paste').fill(LISTE)
    await page.waitForTimeout(150)

    await page.waitForTimeout(250)

    const m = await page.evaluate(() => {
      // 1. Sideoverflow: forsøk å scrolle, les scrollX (fasit).
      window.scrollTo(9999, 0)
      const scrollX = window.scrollX
      window.scrollTo(0, 0)

      // 2. Element mot kort: alt inne i arket måles mot arkets innholdsboks.
      const ark = document.querySelector('.ds-sheet')
      if (!ark) return { scrollX, feil: 'fant ikke arket' }
      const ab = ark.getBoundingClientRect()
      const cs = getComputedStyle(ark)
      const venstre = ab.left + parseFloat(cs.paddingLeft || 0)
      const hoyre = ab.right - parseFloat(cs.paddingRight || 0)

      const overskridelser = []
      for (const el of ark.querySelectorAll('*')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        const over = Math.max(r.right - hoyre, venstre - r.left)
        if (over > 0.5) {
          overskridelser.push({
            hva: el.className?.baseVal ?? String(el.className || el.tagName).split(' ')[0],
            over: Math.round(over),
            bredde: Math.round(r.width)
          })
        }
      }

      // 3. Ellipsis-strekktest: klippes noe tekst uten at det er meningen?
      const klippet = []
      for (const el of ark.querySelectorAll('.onb-player__name, .onb-card__title, .onb-chip, .ds-label, .onb-hint')) {
        if (el.scrollWidth > el.clientWidth + 1) {
          const e = getComputedStyle(el).textOverflow
          klippet.push({ hva: el.className, tekst: el.textContent.trim().slice(0, 28), ellipsis: e === 'ellipsis' })
        }
      }

      // 4. Er handlingsknappene innenfor synlig område?
      const primaer = ark.querySelector('.onb-actions .ds-btn--primary')
      const pr = primaer?.getBoundingClientRect()
      // Er den under folden — kan den i det hele tatt scrolles fram?
      let naabar = null
      if (primaer) {
        primaer.scrollIntoView({ block: 'end' })
        naabar = primaer.getBoundingClientRect().bottom <= window.innerHeight + 1
      }

      // 5. Trykkflater under 44 px
      const smaa = []
      for (const el of ark.querySelectorAll('button, a')) {
        const r = el.getBoundingClientRect()
        if (r.height > 0 && r.height < 44) smaa.push({ hva: String(el.className).split(' ')[0], h: Math.round(r.height) })
      }

      return {
        scrollX,
        arkBredde: Math.round(ab.width),
        overskridelser,
        klippet,
        knappSynlig: pr ? pr.bottom <= window.innerHeight + 0.5 : null,
        knappNaabar: naabar,
        antallSpillere: ark.querySelectorAll('.onb-player').length,
        knappBunn: pr ? Math.round(pr.bottom) : null,
        vindu: window.innerHeight,
        smaa
      }
    })

    rapport.push({ width, height, merke, ...m })
    await ctx.close()
  }
}

await browser.close()

console.log('bredde  høyde     scrollX  ark   overflow           klippet uten ellipsis   knapp synlig')
console.log('─'.repeat(96))
for (const r of rapport) {
  const of = r.overskridelser?.length ? r.overskridelser.map(o => `${o.hva}+${o.over}`).join(' ') : '—'
  const kl = (r.klippet || []).filter(k => !k.ellipsis)
  const klt = kl.length ? kl.map(k => `${k.tekst}…`).join(' | ') : '—'
  console.log(
    `${String(r.width).padEnd(7)} ${String(r.height).padEnd(9)} ${String(r.scrollX).padEnd(8)} ${String(r.arkBredde).padEnd(5)} ${of.slice(0, 18).padEnd(18)} ${klt.slice(0, 23).padEnd(23)} ${r.knappSynlig === false ? `nei, men ${r.knappNaabar ? 'scrollbar' : 'UNÅDD'}` : 'ja'}  n=${r.antallSpillere}`
  )
}
const smaa = rapport.flatMap(r => (r.smaa || []).map(s => `${s.hva}:${s.h}px`))
console.log('\ntrykkflater under 44 px:', smaa.length ? [...new Set(smaa)].join(', ') : 'ingen')
