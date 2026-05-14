// Returns true the first time a key is observed in a session,
// false on subsequent calls. Used to gate decorative stagger animations
// so they play once per session, not every time a view re-mounts.
const seen = new Set()

export function useStaggerOnce(key = 'default') {
  if (seen.has(key)) return false
  seen.add(key)
  return true
}
