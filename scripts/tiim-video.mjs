// Fyller `video` på øvelser som lenker til tiim.no.
//
// tiim (NFF) hoster øvelsesvideoene som MP4 på Qbrick sitt CDN, og adressene
// ligger i sidas __NEXT_DATA__. Treneren limer inn tiim-lenka som før — dette
// skriptet henter filmen bak lenka og legger den på øvelsen, så den kan
// spilles rett i appen.
//
//   node scripts/tiim-video.mjs            # lokal stack, skriver
//   node scripts/tiim-video.mjs --dry      # vis hva som ville blitt skrevet
//   node scripts/tiim-video.mjs --force    # skriv også der video alt finnes
//   PROD=1 node scripts/tiim-video.mjs     # prod: service-key hentes via
//                                          # Management API (SUPABASE_ACCESS_TOKEN
//                                          # i .env.local), se benchboss_db_access
//
// Rendition: nærmest 480p. 720p er 1,5 MB for 22 sekunder — fint på wifi,
// tregt på banen. Hash-prefikset i vertsnavnet strippes: adressen uten det
// svarer likt, og er den samme fra gang til gang.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry')
const FORCE = args.has('--force')

async function klient() {
  if (process.env.PROD) {
    const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())))
    const ref = 'qhgtiioahameqevaugjp'
    const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
      headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }
    })).json()
    const svc = keys.find(k => k.name === 'service_role')?.api_key
    if (!svc) throw new Error('fant ikke service_role-nøkkelen')
    return createClient(`https://${ref}.supabase.co`, svc, { auth: { persistSession: false } })
  }
  const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  return createClient('http://127.0.0.1:54321', SVC, { auth: { persistSession: false } })
}

export function tiimSlug(url) {
  const m = String(url || '').match(/tiim\.no\/ovelse\/([^/?#]+)/)
  return m ? m[1] : null
}

const utenHash = u => u.replace(/^https:\/\/[a-f0-9]{32}-/, 'https://')

// Hele øvelsen slik tiim beskriver den — video, men også navn, type, tema,
// alder og tekst. tiim-import.mjs bruker resten.
export async function hentTiim(slug) {
  const html = await (await fetch(`https://tiim.no/ovelse/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0 (BenchBoss)' } })).text()
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!m) throw new Error(`ingen __NEXT_DATA__ på ${slug}`)
  const d = JSON.parse(m[1]).props?.pageProps?.drill
  if (!d) throw new Error(`ingen øvelse på ${slug}`)

  const tekst = blocks => (blocks || []).filter(b => b._type === 'block')
    .map(b => (b.children || []).map(c => c.text || '').join('').trim()).filter(Boolean)

  const videoer = []
  const bilder = []
  for (const r of d.media?.asset?.resources || []) {
    for (const ren of r.renditions || []) {
      for (const l of ren.links || []) {
        if (l.mimeType === 'video/mp4') {
          const v = (ren.videos || [])[0] || {}
          videoer.push({ url: utenHash(l.href), height: v.height || 0, duration: v.duration || 0 })
        }
        if (l.mimeType === 'image/jpeg') bilder.push({ url: utenHash(l.href), height: ren.height || 0, thumb: (r.rel || []).includes('thumbnail') })
      }
    }
  }
  // Nærmest 480p, og helst ikke under 360.
  const mp4 = videoer.sort((a, b) => Math.abs(a.height - 480) - Math.abs(b.height - 480))[0] || null
  const poster = (bilder.filter(b => b.thumb).sort((a, b) => b.height - a.height)[0] || bilder.sort((a, b) => b.height - a.height)[0]) || null

  return {
    slug,
    title: (d.title || '').trim(),
    type: (d.type || []).map(t => t.name.trim()),
    topic: (d.topic || []).map(t => t.name.trim()),
    level: (d.level || []).map(t => t.name.trim()),
    momenter: tekst(d.learningOpportunities),
    organisering: tekst(d.organizing),
    video: mp4 ? {
      url: mp4.url,
      poster: poster?.url || null,
      duration: Math.round(mp4.duration),
      source: 'tiim',
      source_url: `https://tiim.no/ovelse/${slug}`
    } : null
  }
}

async function main() {
  const sb = await klient()
  const { data, error } = await sb.from('training_exercises').select('id, name, link, video')
  if (error) throw error
  const kandidater = data.filter(e => tiimSlug(e.link?.url) && (FORCE || !e.video))
  console.log(`${data.length} øvelser, ${kandidater.length} med tiim-lenke${FORCE ? '' : ' uten video'}`)
  for (const e of kandidater) {
    const slug = tiimSlug(e.link.url)
    try {
      const t = await hentTiim(slug)
      if (!t.video) { console.log(`  –  ${e.name}: ingen video på tiim`); continue }
      console.log(`  ${DRY ? '~' : '+'}  ${e.name}: ${t.video.duration} sek, ${t.video.url.match(/_(\d+p)\.mp4/)?.[1]}${t.video.poster ? ', poster' : ', ingen poster'}`)
      if (DRY) continue
      const { error: feil, data: rad } = await sb.from('training_exercises').update({ video: t.video }).eq('id', e.id).select('id')
      if (feil || !rad?.length) console.log(`     FEIL: ${feil?.message || 'ingen rad oppdatert (RLS?)'}`)
    } catch (err) {
      console.log(`  !  ${e.name}: ${err.message}`)
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1) })
