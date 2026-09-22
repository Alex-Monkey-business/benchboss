import { ref, watch } from 'vue'
import { syncChromeColor } from '../lib/chromeColor'

// Design: 'standard' | 'whspr'
//
// En egen akse fra temaet, ikke en fjerde temaverdi. Whspr finnes i både lys
// og mørk, akkurat som standard — «cream broadsheet» og «dark velvet chamber»
// er to sider av samme system. Ville vi presset det inn i useTheme, måtte
// hver kombinasjon vært sin egen verdi.
const STORAGE_KEY = 'bb-design'
const VALID = ['standard', 'whspr']

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return VALID.includes(v) ? v : 'standard'
  } catch {
    // Privat modus eller blokkert lagring: standard, som før.
    return 'standard'
  }
}

const design = ref(readStored())

function applyDesign() {
  document.documentElement.setAttribute('data-design', design.value)
  syncChromeColor()
}

if (typeof window !== 'undefined') applyDesign()

watch(design, () => {
  try { localStorage.setItem(STORAGE_KEY, design.value) } catch {}
  applyDesign()
})

export function useDesign() {
  function setDesign(next) {
    if (!VALID.includes(next)) return
    design.value = next
  }
  return { design, setDesign }
}
