// Henter øvelser fra tiim.no inn i banken.
//
//   node scripts/tiim-import.mjs --liste                 # kandidater for kullets alder
//   node scripts/tiim-import.mjs <slug> [<slug> …]       # legg inn (lokal stack)
//   node scripts/tiim-import.mjs --med-tekst <slug> …    # ta med tiims tekst
//   PROD=1 node scripts/tiim-import.mjs <slug> …
//
// Uten --med-tekst tas bare STRUKTUREN med: navn, kategori, tema, alder,
// video og lenke. Momenter og gjennomføring er NFF sin tekst, og grensen vi
// har holdt er «tall og struktur ja, beskrivelsestekst nei — lenka er den
// rette bruken». Med videoen inne i appen står øvelsen fint på egne bein:
// film + navn + tema er nok til å kjenne den igjen på banen, og treneren
// skriver sine egne momenter når han har kjørt den én gang.
//
// Bruk --med-tekst bare når Alex har sagt at det er greit.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { hentTiim } from './tiim-video.mjs'

const args = process.argv.slice(2)
const MED_TEKST = args.includes('--med-tekst')
const LISTE = args.includes('--liste')
const slugs = args.filter(a => !a.startsWith('--'))

// tiims typer → bankens kategorier. «Situasjonsøvelse» er spill med og mot
// i små grupper — nærmest «spill» hos oss, ikke «pasning».
const KATEGORI = [
  [/Oppvarming/i, 'oppvarming'],
  [/Scoringstrening/i, 'skudd'],
  [/Spill \(Smålagspill\)/i, 'spill'],
  [/Situasjonsøvelse/i, 'spill'],
  [/Fotballek/i, 'oppvarming']
]

// «8-9 år» → 8, «10-12 år» → 10. Laveste aldersgruppe øvelsen er merket for.
function minAlder(levels) {
  const tall = levels.map(l => parseInt(l, 10)).filter(n => !isNaN(n))
  return tall.length ? Math.min(...tall) : null
}

function tilOvelse(t) {
  const category = (KATEGORI.find(([re]) => t.type.some(x => re.test(x))) || [])[1] || null
  const ovelse = {
    name: t.title.replace(/^NY:\s*/i, '').trim(),
    type: 'none',
    category,
    tema: t.topic[0] || null,
    min_alder: minAlder(t.level),
    laeringsmomenter: [],
    se_etter: [],
    si_til_barna: [],
    utstyr_tags: [],
    video: t.video,
    link: { label: t.title.trim(), url: `https://tiim.no/ovelse/${t.slug}` }
  }
  if (MED_TEKST) {
    ovelse.laeringsmomenter = t.momenter
    ovelse.organisering = t.organisering.join('\n')
  }
  return ovelse
}

async function klient() {
  if (process.env.PROD) {
    const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())))
    const ref = 'qhgtiioahameqevaugjp'
    const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } })).json()
    return createClient(`https://${ref}.supabase.co`, keys.find(k => k.name === 'service_role').api_key, { auth: { persistSession: false } })
  }
  const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  return createClient('http://127.0.0.1:54321', SVC, { auth: { persistSession: false } })
}

// Kandidatlista: fotballøvelser merket 8-9 eller 10-12 år, med video, som
// ikke er programserier (Telenor Xtra, Rolletrening) — de er egne opplegg.
async function liste() {
  const html = await (await fetch('https://tiim.no/okter-og-ovelser', { headers: { 'User-Agent': 'Mozilla/5.0 (BenchBoss)' } })).text()
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  const alle = JSON.parse(m[1]).props.pageProps.allSessionsAndDrills
  const navn = xs => (xs || []).map(x => x.name.trim())
  const ok = alle.filter(i => i._type === 'drill' && i.media
    && navn(i.view).includes('Fotball')
    && navn(i.level).some(l => l === '8-9 år' || l === '10-12 år')
    && !/Telenor Xtra|Rolletrening/.test(i.title))
  const grupper = {}
  for (const i of ok) {
    const k = (navn(i.type)[0] || 'Annet')
    ;(grupper[k] ||= []).push(i)
  }
  for (const [k, v] of Object.entries(grupper)) {
    console.log(`\n## ${k} (${v.length})`)
    for (const i of v.sort((a, b) => a.title.localeCompare(b.title, 'no'))) {
      console.log(`  ${i.slug.current.padEnd(52)} ${i.title.trim()}  [${navn(i.level).join(', ')}]  ${navn(i.topic).join(' · ')}`)
    }
  }
}

async function main() {
  if (LISTE) return liste()
  if (!slugs.length) { console.log('Oppgi slugs, eller --liste'); return }
  const sb = await klient()
  const { data: fins } = await sb.from('training_exercises').select('id, name, link')
  for (const slug of slugs) {
    const t = await hentTiim(slug)
    const ovelse = tilOvelse(t)
    const dublett = (fins || []).find(e => e.link?.url?.includes(`/ovelse/${slug}`) || e.name.trim().toLowerCase() === ovelse.name.toLowerCase())
    if (dublett) { console.log(`  =  ${ovelse.name}: finnes alt («${dublett.name}»)`); continue }
    const { data, error } = await sb.from('training_exercises').insert(ovelse).select('id')
    console.log(error || !data?.length ? `  !  ${ovelse.name}: ${error?.message || 'ingen rad'}` : `  +  ${ovelse.name} (${ovelse.category || 'uten kategori'}, ${ovelse.min_alder} år+${ovelse.video ? ', video' : ''})`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
