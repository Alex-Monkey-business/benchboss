import { computed } from 'vue'
import { useAuth } from '../stores/auth'
import { principles as halsenG2015Principles } from '../content/principles'
import { meetings as halsenG2015Meetings } from '../content/meetings'

// Innhold som er skrevet for ETT kull: håndboka og møtereferatene.
//
// Filene i content/ er Halsen G2015 sine. De var importert rett inn i views,
// og ville dermed vist Halsens prinsipper («11-åringer», «24 spillere») og
// Halsens referater — med navngitte barn — til enhver trener i ethvert kull.
//
// Nøkkelen er klubbens kortnavn og kullets slug. Et kull uten oppslag får tomt,
// og views viser en tom tilstand. Neste steg er innhold i basen per kull; da
// forsvinner dette registeret.
const REGISTRY = {
  'halsen/g2015': {
    principles: halsenG2015Principles,
    meetings: halsenG2015Meetings
  }
}

export function useContent() {
  const { activeCohort } = useAuth()

  const entry = computed(() => {
    const c = activeCohort.value
    if (!c?.club_key || !c?.slug) return null
    return REGISTRY[`${c.club_key}/${c.slug}`] || null
  })

  const principles = computed(() => entry.value?.principles || [])
  const meetings = computed(() => entry.value?.meetings || [])
  const meetingsByDate = computed(() =>
    [...meetings.value].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  )

  const hasHandbook = computed(() => principles.value.length > 0)
  const hasMeetings = computed(() => meetings.value.length > 0)

  function findPrinciple(slug) {
    return principles.value.find(p => p.slug === slug) || null
  }

  function findMeeting(slug) {
    return meetings.value.find(m => m.slug === slug) || null
  }

  return { principles, meetings, meetingsByDate, hasHandbook, hasMeetings, findPrinciple, findMeeting }
}
