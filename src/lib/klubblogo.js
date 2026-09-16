// Klubbmerket ligger åpent hos fotball.no, nøkkelen er klubbens fiksId.
//
// Egen fil, ikke en eksport fra lib/fiks: Hjem viser merket, og Hjem skal
// ikke dra inn iCal-parseren og klubbsøket for én URL-streng.
export function clubLogo(fiksId) {
  return fiksId ? `https://images.fotball.no/clublogos/${fiksId}.png` : null
}

// «Store Bergan rød» er laget, «Store Bergan» er klubben. Kretsen setter
// farge, tall og årgang bak klubbnavnet, og det er klubben merket hører til.
const HALE = /^(rød|roed|rod|grønn|gronn|hvit|blå|blaa|bla|gul|sort|svart|lilla|oransje|rosa|grå|graa|gra|brun|turkis|\d+|[gj]\d{1,4}|[a-z])$/i

export function clubNameFromTeam(teamName) {
  const ord = String(teamName || '').trim().split(/\s+/)
  while (ord.length > 1 && HALE.test(ord[ord.length - 1])) ord.pop()
  return ord.join(' ')
}

// Søket hos fotball.no er uskarpt: «Sem» gir Sel, Sømna og Selbak før
// Sem IF. Vi vil ha klubben som faktisk heter det vi spurte om, og helst i
// samme krets som oss — motstanderne i en barneserie er naboer.
function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/\b(idrettsforening|idrettslag|fotballklubb|ballklubb|sportsklubb|il|if|fk|bk|sk|ail)\b/g, '')
    .replace(/[^a-zæøå0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

export function rankClubs(results, query, district) {
  const q = norm(query)
  if (!q) return null
  const first = q.split(' ')[0]
  let best = null, bestScore = 0
  for (const c of results || []) {
    const n = norm(c.name)
    let score = 0
    if (n === q) score += 4
    else if (n.startsWith(q)) score += 3
    else if (n.startsWith(first)) score += 1
    if (district && c.district === district) score += 2
    if (score > bestScore) { bestScore = score; best = c }
  }
  // Et treff bare på krets er ikke et treff. Navnet må stemme.
  return bestScore >= 3 ? best : null
}
