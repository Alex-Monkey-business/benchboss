// Dommersats per spillform, i kroner.
//
// 9er gikk opp til 250 kr i november 2026. Resten står på 200.
//
// Satsen følger spillformen på kullet, ikke `matches.fee_amount`. Den kolonnen
// får bare standardverdien fra basen (200) ved import, og ingen kan endre den i
// appen, så den ville vist 200 på alle 9er-kamper som allerede ligger inne.
// Det som faktisk er lagt ut, står på utlegget (`expenses.amount`) og endres
// ikke når satsen endres.
const SATS = { 9: 250 }
const STANDARD = 200

export function dommersats(spillform) {
  return SATS[spillform] ?? STANDARD
}
