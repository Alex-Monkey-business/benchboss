import { ref, watch } from 'vue'

// Theme: 'light' | 'dark' | 'system'
// Stored in localStorage. 'system' resolves to current OS preference.
const STORAGE_KEY = 'bb-theme'
const VALID = ['light', 'dark', 'system']

function readStored() {
  const v = localStorage.getItem(STORAGE_KEY)
  return VALID.includes(v) ? v : 'system'
}

const theme = ref(readStored())
const systemDark = ref(false)

function applyTheme() {
  const resolved = theme.value === 'system' ? (systemDark.value ? 'dark' : 'light') : theme.value
  document.documentElement.setAttribute('data-theme', resolved)
  // Sync browser chrome color
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0E0E0D' : '#FFFFFF')
}

// Initialize once on module load
if (typeof window !== 'undefined') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = mq.matches
  mq.addEventListener('change', e => {
    systemDark.value = e.matches
    if (theme.value === 'system') applyTheme()
  })
  applyTheme()
}

watch(theme, () => {
  localStorage.setItem(STORAGE_KEY, theme.value)
  applyTheme()
})

export function useTheme() {
  function setTheme(next) {
    if (!VALID.includes(next)) return
    theme.value = next
  }
  function toggle() {
    // Quick toggle cycles light → dark → system
    const i = VALID.indexOf(theme.value)
    setTheme(VALID[(i + 1) % VALID.length])
  }
  return { theme, setTheme, toggle, systemDark }
}
