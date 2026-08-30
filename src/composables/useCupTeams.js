import { computed } from 'vue'
import { useCupMatches } from './useCupMatches'
import { useCupSquad } from './useCupSquad'
import { cupTeam } from '../lib/cupTeams'

// Cup-lagene for cupen som er lastet — utledet, ikke listet opp.
//
// De sto i lib/cupTeams.js som to faste rader: «Halsen IF» og «Halsen IF 2».
// De er Halsens påmelding til Sandarcupen, ikke en egenskap ved appen, og Sten
// møtte dem i sitt eget kull uten å ha meldt på noen.
//
// Lagene finnes allerede i dataene: hver cup-kamp bærer sin `our_team`, og hver
// tropprad sitt `cup_team`. Har et kull ingen cup, er lista tom — og en tom
// liste er hele poenget. Navnene slår vi opp i den gamle tabellen så Halsens
// egne cuper står som de alltid har gjort; en ukjent slug bærer sitt eget navn.
export function useCupTeams() {
  const { cupMatches } = useCupMatches()
  const { squad } = useCupSquad()

  const cupTeams = computed(() => {
    const slugs = []
    // Kampene først: rekkefølgen der er den treneren kjenner igjen.
    for (const m of cupMatches.value) {
      if (m.our_team && !slugs.includes(m.our_team)) slugs.push(m.our_team)
    }
    for (const r of squad.value) {
      if (r.cup_team && !slugs.includes(r.cup_team)) slugs.push(r.cup_team)
    }
    return slugs.map(slug => cupTeam(slug) || { slug, name: slug, trainers: [] })
  })

  return { cupTeams }
}
