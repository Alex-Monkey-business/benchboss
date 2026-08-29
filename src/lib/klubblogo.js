// Klubbmerket ligger åpent hos fotball.no, nøkkelen er klubbens fiksId.
//
// Egen fil, ikke en eksport fra lib/fiks: Hjem viser merket, og Hjem skal
// ikke dra inn iCal-parseren og klubbsøket for én URL-streng.
export function clubLogo(fiksId) {
  return fiksId ? `https://images.fotball.no/clublogos/${fiksId}.png` : null
}
