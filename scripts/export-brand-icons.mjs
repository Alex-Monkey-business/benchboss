import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
const root = new URL('../', import.meta.url)
const out = new URL('output/branding/benchboss-whspr/', root)
await mkdir(out, { recursive: true })
const component = await readFile(new URL('src/components/BenchBossBrand.vue', root), 'utf8')
const defs = component.match(/<defs>([\s\S]*?)<\/defs>/)[1]
const raster = (await readFile(new URL('public/brand/bench-boss-sidelinja.png', root))).toString('base64')
const logo = (dark=false) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="80 135 1376 755"><defs>${defs}</defs><image href="data:image/png;base64,${raster}" width="1536" height="1024" filter="url(#bench-whspr${dark?'-dark':''})"/></svg>`
const icon = (dark=false, maskable=false) => {
 const w=maskable?350:410, h=w*755/1376
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${dark?'#1a1a1a':'#ffffeb'}"/><svg x="${(512-w)/2}" y="${(512-h)/2}" width="${w}" height="${h}" viewBox="80 135 1376 755">${logo(dark).replace(/^<svg[^>]*>|<\/svg>$/g,'')}</svg></svg>`
}
const favicon = await readFile(new URL('public/brand/bench-boss-favicon.svg', root), 'utf8')
const browser = await chromium.launch({headless:true})
const page = await browser.newPage({deviceScaleFactor:1})
async function render(name, svg, width, height=width) {
 await page.setViewportSize({width,height})
 await page.setContent(`<style>html,body{margin:0;background:transparent}body>svg{display:block;width:100%;height:100%}</style>${svg}`)
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('image')).every(el=>el.href.baseVal.startsWith('data:')))
 await page.waitForTimeout(150)
 await page.screenshot({path:fileURLToPath(new URL(name,out)),omitBackground:true})
}
for(const dark of [false,true]) {
 const name=`benchboss-logo-${dark?'dark':'light'}`
 await writeFile(new URL(`${name}.svg`,out),logo(dark))
 await render(`${name}.png`,logo(dark),1376,755)
 await render(`benchboss-app-${dark?'dark':'cream'}-1024.png`,icon(dark),1024)
}
await render('benchboss-google-120.png',icon(),120)
await render('benchboss-google-512.png',icon(),512)
for(const size of [180,192,512]) {
 await render(`icon-${size}.png`,icon(),size)
 await copyFile(new URL(`icon-${size}.png`,out),new URL(`public/icons/icon-${size}.png`,root))
}
await render('icon-maskable-512.png',icon(false,true),512)
await copyFile(new URL('icon-maskable-512.png',out),new URL('public/icons/icon-maskable-512.png',root))
for(const size of [16,32,48]) {
 await render(`favicon-${size}.png`,favicon,size)
 await copyFile(new URL(`favicon-${size}.png`,out),new URL(`public/icons/favicon-${size}.png`,root))
}
await writeFile(new URL('public/brand/bench-boss-mark.svg',root),icon())
await writeFile(new URL('public/brand/bench-boss-logo.svg',root),logo())
await writeFile(new URL('public/brand/bench-boss-logo-dark.svg',root),logo(true))
await browser.close()
console.log('Exported Whspr logo package, Google images, app icons and favicons.')
