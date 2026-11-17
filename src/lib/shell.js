import { ref } from 'vue'

// Skallet (bunnmenyen) kan skjules av en visning som trenger hele skjermen.
// Live kampmodus er den eneste brukeren i dag: treneren på sidelinja skal ha
// banen, ikke fem faner hen ikke skal trykke på. Visningen nullstiller selv
// når den forlates.
export const navHidden = ref(false)

// Første Hjem-henting er ferdig (useToday). App.vue venter med å laste ned de
// andre fanene til da, så de ikke slåss med Hjem om båndbredden ved kald start.
let hjemFerdig = null
export const hjemKlar = new Promise(r => { hjemFerdig = r })
export function meldHjemKlar() { hjemFerdig?.() }
