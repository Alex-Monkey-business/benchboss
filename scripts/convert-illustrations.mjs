#!/usr/bin/env node
// Konverter PNG-illustrasjoner til WebP (transparens bevart, kvalitet 80).
// Idempotent: hopper over filer som allerede har en WebP nyere enn PNG-en.
// Kjør etter at du har sluppet inn nye PNG-er: npm run images
//
// Scanner øvelses-illustrasjonsmappa rekursivt.

import sharp from 'sharp'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'illustrations', 'bench-boss-exercise-illustrations')

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) out.push(full)
  }
  return out
}

if (!existsSync(ROOT)) {
  console.log(`Ingen mappe ${ROOT} — ingenting å gjøre.`)
  process.exit(0)
}

const pngs = walk(ROOT)
let converted = 0

for (const png of pngs) {
  const webp = png.replace(/\.png$/i, '.webp')
  const fresh = existsSync(webp) && statSync(webp).mtimeMs >= statSync(png).mtimeMs
  if (fresh) continue
  await sharp(png).webp({ quality: 80 }).toFile(webp)
  console.log(`✓ ${webp.slice(ROOT.length + 1)}`)
  converted++
}

console.log(converted ? `Konverterte ${converted} bilde(r) til WebP.` : 'Alle WebP er oppdaterte.')
