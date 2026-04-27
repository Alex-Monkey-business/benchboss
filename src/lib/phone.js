// Helpers for 8-digit Norwegian phone numbers.
// Storage format: plain 8 digits, no prefix or separators.
// Display format: "XXX XX XXX".
// Deep-link format: "47XXXXXXXX" (country code, no '+').

export function parsePhone(input) {
  if (!input) return ''
  const digits = String(input).replace(/\D/g, '')
  const stripped = digits.startsWith('47') && digits.length === 10 ? digits.slice(2) : digits
  return stripped.length === 8 ? stripped : ''
}

export function formatPhone(phone) {
  const p = parsePhone(phone)
  if (!p) return ''
  return `${p.slice(0, 3)} ${p.slice(3, 5)} ${p.slice(5)}`
}

export function phoneE164(phone) {
  const p = parsePhone(phone)
  return p ? `+47${p}` : ''
}

export function phoneVipps(phone) {
  const p = parsePhone(phone)
  return p ? `47${p}` : ''
}
