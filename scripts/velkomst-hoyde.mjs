import { chromium } from 'playwright'
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
// Bredde × SYNLIG høyde i Safari (adressefelt + verktøylinje trukket fra).
const ENHETER = [
  ['iPhone SE (1. gen)', 320, 454],
  ['iPhone SE 2/3, 8',   375, 553],
  ['iPhone 12/13 mini',  360, 629],
  ['iPhone 14',          390, 664],
  ['iPhone 15 Pro',      393, 668],
  ['iPhone 15 Pro Max',  430, 745]
]
const b=await chromium.launch()
console.log('enhet                  bredde×høyde   innhold   scroll?   knapp synlig')
console.log('─'.repeat(74))
for (const [navn,w,h] of ENHETER) {
  const l=await(await fetch('http://127.0.0.1:54321/auth/v1/admin/generate_link',{method:'POST',headers:{apikey:SVC,Authorization:'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'alexander.samnoy+sten@gmail.com'})})).json()
  const c=await b.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true,colorScheme:'dark'})
  const p=await c.newPage()
  await p.goto(l.action_link,{waitUntil:'networkidle'}); await p.waitForTimeout(1500)
  const m=await p.evaluate(()=>{
    const doc=document.documentElement
    const knapp=document.querySelector('.kig__hovedknapp')
    const sig=document.querySelector('.kig__signatur')
    const bunn=Math.max(knapp?knapp.getBoundingClientRect().bottom:0, sig?sig.getBoundingClientRect().bottom:0)
    return {
      innhold: Math.round(doc.scrollHeight),
      vindu: window.innerHeight,
      scroller: doc.scrollHeight > window.innerHeight + 1,
      knappBunn: knapp ? Math.round(knapp.getBoundingClientRect().bottom) : null,
      alt: Math.round(bunn)
    }
  })
  console.log(
    `${navn.padEnd(22)} ${String(w+'×'+h).padEnd(14)} ${String(m.innhold).padEnd(9)} ${(m.scroller?'JA':'nei').padEnd(9)} ${m.knappBunn<=m.vindu?'ja':'NEI ('+m.knappBunn+'>'+m.vindu+')'}`
  )
  await c.close()
}
await b.close()
