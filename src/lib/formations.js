// Formasjoner per spillform. Slot-IDene er kontrakten mot lagrede stints og
// SLOTS i playerPositions.js (posisjon per slot og spillform) — nye slots må
// inn begge steder.
// x/y i prosent av banen, y fra topp; vi angriper oppover.
const FORMATIONS = {
  // 3er: ingen keeper.
  3: [
    { id: 'f1', role: 'field', x: 50, y: 22 },
    { id: 'm1', role: 'field', x: 25, y: 58 },
    { id: 'm3', role: 'field', x: 75, y: 58 }
  ],
  // 5er: 1-2-1.
  5: [
    { id: 'f1', role: 'field',  x: 50, y: 18 },
    { id: 'm1', role: 'field',  x: 22, y: 44 },
    { id: 'm3', role: 'field',  x: 78, y: 44 },
    { id: 'd1', role: 'field',  x: 50, y: 66 },
    { id: 'gk', role: 'keeper', x: 50, y: 89 }
  ],
  // 7er: 2-3-1.
  7: [
    { id: 'f1', role: 'field',  x: 50, y: 16 },
    { id: 'm1', role: 'field',  x: 20, y: 42 },
    { id: 'm2', role: 'field',  x: 50, y: 40 },
    { id: 'm3', role: 'field',  x: 80, y: 42 },
    { id: 'd1', role: 'field',  x: 30, y: 68 },
    { id: 'd2', role: 'field',  x: 70, y: 68 },
    { id: 'gk', role: 'keeper', x: 50, y: 89 }
  ],
  // 9er: 3-4-1. To sentrale midtbaner og vinger, én spiss. Slot-ID-ene for
  // midtbanen er m1, m2, m4, m3 fra venstre: m1–m3 betyr det samme som i 7er.
  9: [
    { id: 'f1', role: 'field',  x: 50, y: 14 },
    // Over midtsirkelen, så navnene under ikke legger seg oppå streken.
    { id: 'm1', role: 'field',  x: 14, y: 38 },
    { id: 'm2', role: 'field',  x: 38, y: 35 },
    { id: 'm4', role: 'field',  x: 62, y: 35 },
    { id: 'm3', role: 'field',  x: 86, y: 38 },
    { id: 'd1', role: 'field',  x: 25, y: 66 },
    { id: 'd2', role: 'field',  x: 50, y: 68 },
    { id: 'd3', role: 'field',  x: 75, y: 66 },
    { id: 'gk', role: 'keeper', x: 50, y: 89 }
  ],
  // 11er: 4-3-3.
  11: [
    { id: 'f1', role: 'field',  x: 25, y: 14 },
    { id: 'f2', role: 'field',  x: 50, y: 12 },
    { id: 'f3', role: 'field',  x: 75, y: 14 },
    { id: 'm1', role: 'field',  x: 28, y: 38 },
    { id: 'm2', role: 'field',  x: 50, y: 40 },
    { id: 'm3', role: 'field',  x: 72, y: 38 },
    { id: 'd1', role: 'field',  x: 15, y: 64 },
    { id: 'd2', role: 'field',  x: 38, y: 68 },
    { id: 'd3', role: 'field',  x: 62, y: 68 },
    { id: 'd4', role: 'field',  x: 85, y: 64 },
    { id: 'gk', role: 'keeper', x: 50, y: 89 }
  ]
}

export const PLAYERS_ON_PITCH_OPTIONS = [3, 5, 7, 9, 11]

export function formationFor(playersOnPitch) {
  return FORMATIONS[playersOnPitch] || FORMATIONS[7]
}
