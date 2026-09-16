import { reactive } from 'vue'
import { useAuth } from '../stores/auth'
import { isOurs } from '../lib/matchMeta'
import { clubLogo, clubNameFromTeam, rankClubs } from '../lib/klubblogo'
import { CLUB_SEARCH_URL, clubSearchBody, parseClubSearch } from '../lib/fiks'

// Klubbmerker på kampsida, som FotMob. Vårt eget merke kjenner vi fra
// kullet. Motstanderens slår vi opp én gang i klubbsøket hos fotball.no og
// husker i nettleseren — søket er 65–180 kB, og svaret endrer seg ikke.
//
// Oppslaget skjer bare der merket vises. Lista ber aldri om det.

const NOKKEL = 'bb-klubbmerke:'
const merker = reactive({})      // klubbnavn → fiksId | null
const underveis = new Map()
let egenKrets = null              // «NFF Vestfold» — snevrer inn uskarpe treff

function lesLagret(navn) {
  try {
    const v = localStorage.getItem(NOKKEL + navn)
    if (v === null) return undefined
    return v === '' ? null : v
  } catch { return undefined }
}

function lagre(navn, fiksId) {
  try { localStorage.setItem(NOKKEL + navn, fiksId || '') } catch {}
}

async function sok(query) {
  const res = await fetch(CLUB_SEARCH_URL, { method: 'POST', body: clubSearchBody(query) })
  if (!res.ok) throw new Error(`fotball.no ${res.status}`)
  return parseClubSearch(await res.text())
}

async function finnEgenKrets(cohort) {
  if (egenKrets !== null) return egenKrets
  const lagret = lesLagret('krets:' + cohort.club_fiks_id)
  if (lagret !== undefined) { egenKrets = lagret || ''; return egenKrets }
  try {
    const treff = await sok(cohort.club_name || cohort.club_short_name || '')
    egenKrets = treff.find(c => String(c.fiksId) === String(cohort.club_fiks_id))?.district || ''
  } catch { egenKrets = '' }
  lagre('krets:' + cohort.club_fiks_id, egenKrets)
  return egenKrets
}

async function slaOpp(navn, cohort) {
  if (underveis.has(navn)) return underveis.get(navn)
  const p = (async () => {
    try {
      const krets = cohort?.club_fiks_id ? await finnEgenKrets(cohort) : ''
      const treff = rankClubs(await sok(navn), navn, krets)
      merker[navn] = treff ? String(treff.fiksId) : null
    } catch {
      // Nettet feilet — ikke lagre, så neste besøk prøver igjen.
      merker[navn] = null
      return
    }
    lagre(navn, merker[navn])
  })()
  underveis.set(navn, p)
  return p
}

export function useKlubbmerke() {
  const { activeCohort } = useAuth()

  // Reaktiv: null til vi vet, så URL eller null for godt. Komponenten faller
  // tilbake til initialer når det ikke finnes noe merke.
  function merkeFor(teamName) {
    if (!teamName) return null
    const cohort = activeCohort.value
    if (isOurs(teamName)) return clubLogo(cohort?.club_fiks_id)
    const navn = clubNameFromTeam(teamName)
    if (!(navn in merker)) {
      const lagret = lesLagret(navn)
      if (lagret !== undefined) merker[navn] = lagret
      else { merker[navn] = null; slaOpp(navn, cohort) }
    }
    return clubLogo(merker[navn])
  }

  return { merkeFor }
}
