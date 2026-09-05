// Lager plakatbilde til videoer som mangler det.
//
// 76 av 117 tiim-videoer for 10–12 år har ikke noe stillbilde på tiim. Uten
// plakat er kortet i banken en svart boks til filmen er lastet — og 76 svarte
// bokser er ikke en øvelsesbank. Vi henter et bilde fra filmen selv: en
// nettleser (Playwright) spoler til 20 % inn, tegner rammen på et canvas og
// lagrer JPEG. CDN-et svarer med CORS `*`, så canvaset blir ikke «tainted».
//
// Bildene legges i Supabase Storage (offentlig bøtte `ovelsesbilder`), og
// `video.poster` pekes dit. Lokalt og i prod er det samme oppskrift.
//
//   node scripts/tiim-poster.mjs            # lokal stack
//   node scripts/tiim-poster.mjs --force    # lag nytt også der plakat finnes
//   node scripts/tiim-poster.mjs --force --navn=Rosenborg --andel=0.5
//                                            # én øvelse, ramme 50 % inn (tiims
//                                            # artikkelfilmer starter med tekstplakat)
//   PROD=1 node scripts/tiim-poster.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const args = new Set(process.argv.slice(2))
const FORCE = args.has('--force')
const NAVN = [...args].find(a => a.startsWith('--navn='))?.slice(7) || ''
const ANDEL = Number([...args].find(a => a.startsWith('--andel='))?.slice(8) || 0.2)
const BOTTE = 'ovelsesbilder'

async function klient() {
  if (process.env.PROD) {
    const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())))
    const ref = 'qhgtiioahameqevaugjp'
    const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } })).json()
    const svc = keys.find(k => k.name === 'service_role')?.api_key
    return { sb: createClient(`https://${ref}.supabase.co`, svc, { auth: { persistSession: false } }), url: `https://${ref}.supabase.co` }
  }
  const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  return { sb: createClient('http://127.0.0.1:54321', SVC, { auth: { persistSession: false } }), url: 'http://127.0.0.1:54321' }
}

// Rammen som JPEG, tatt i en ekte nettleser. 640×360: nok til et kort på
// mobil, ~30 KB.
async function ramme(page, url, sekunder) {
  return page.evaluate(async ({ url, sekunder }) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.src = url
    document.body.appendChild(v)
    await new Promise((ok, feil) => {
      v.addEventListener('loadedmetadata', ok, { once: true })
      v.addEventListener('error', () => feil(new Error('kunne ikke laste video')), { once: true })
    })
    v.currentTime = Math.min(sekunder, Math.max(0, v.duration - 0.5))
    await new Promise((ok, feil) => {
      v.addEventListener('seeked', ok, { once: true })
      v.addEventListener('error', () => feil(new Error('kunne ikke spole')), { once: true })
    })
    // Etter seeked kan rammen fortsatt være ute av dekoderen et øyeblikk.
    await new Promise(r => setTimeout(r, 150))
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 360
    c.getContext('2d').drawImage(v, 0, 0, 640, 360)
    v.remove()
    return c.toDataURL('image/jpeg', 0.82)
  }, { url, sekunder })
}

async function main() {
  const { sb, url } = await klient()
  const { data: botter } = await sb.storage.listBuckets()
  if (!botter?.some(b => b.name === BOTTE)) {
    const { error } = await sb.storage.createBucket(BOTTE, { public: true, fileSizeLimit: '2MB', allowedMimeTypes: ['image/jpeg'] })
    if (error) throw error
    console.log(`laget bøtta ${BOTTE}`)
  }

  const { data, error } = await sb.from('training_exercises').select('id, name, video, link')
  if (error) throw error
  const kandidater = data.filter(e => e.video?.url && (FORCE || !e.video.poster) && (!NAVN || e.name.includes(NAVN)))
  console.log(`${kandidater.length} videoer trenger plakat`)
  if (!kandidater.length) return

  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto('about:blank')
  for (const e of kandidater) {
    try {
      const sek = Math.max(1, Math.round((e.video.duration || 20) * ANDEL))
      const dataUrl = await ramme(page, e.video.url, sek)
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64')
      const slug = (e.video.source_url || e.link?.url || e.id).split('/').pop().replace(/[^a-z0-9-]/gi, '') || e.id
      const sti = `${slug}.jpg`
      const { error: opp } = await sb.storage.from(BOTTE).upload(sti, buf, { contentType: 'image/jpeg', upsert: true })
      if (opp) throw opp
      const poster = `${url}/storage/v1/object/public/${BOTTE}/${sti}`
      const { error: feil, data: rad } = await sb.from('training_exercises').update({ video: { ...e.video, poster } }).eq('id', e.id).select('id')
      if (feil || !rad?.length) throw feil || new Error('ingen rad oppdatert')
      console.log(`  +  ${e.name}: ${Math.round(buf.length / 1024)} KB @ ${sek}s`)
    } catch (err) {
      console.log(`  !  ${e.name}: ${err.message}`)
    }
  }
  await browser.close()
}

main().catch(e => { console.error(e); process.exit(1) })
