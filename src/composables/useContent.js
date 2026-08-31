import { computed } from 'vue'
import { useAuth } from '../stores/auth'
import { principles as halsenG2015Principles } from '../content/principles'
import { meetings as halsenG2015Meetings } from '../content/meetings'

// Innhold skrevet av ett kull. De to tingene deles IKKE likt, og det er hele
// poenget med at de står i hvert sitt register.
//
// HÅNDBOKA er klubbens. «Det skal være gøy» og «alle skal spille» gjelder like
// mye for G2020 som for G2015, og et nytt kull skal arve dem i stedet for å
// møte en tom side. Den er merket med hvem som skrev den — prinsippene snakker
// om elleveåringer, og da må leseren vite hvem de er skrevet for.
//
// MØTEREFERATENE er kullets, og blir det. Der står navngitte barn med
// vurderinger knyttet til seg. De skal aldri nå en trener i et annet kull,
// uansett hvor mye samme klubb det er.
//
// Neste steg for begge er innhold i basen per kull; da forsvinner registeret.
const HANDBOK = {
  halsen: { principles: halsenG2015Principles, opphav: 'G2015' }
}

const REFERATER = {
  'halsen/g2015': halsenG2015Meetings
}

export function useContent() {
  const { activeCohort } = useAuth()

  const handbok = computed(() => {
    const c = activeCohort.value
    if (!c?.club_key) return null
    return HANDBOK[c.club_key] || null
  })

  const principles = computed(() => handbok.value?.principles || [])

  // Kullet som skrev håndboka — tomt når det er ditt eget. «Fra G2015» på noe
  // du selv skrev er støy.
  const handbokOpphav = computed(() => {
    const o = handbok.value?.opphav
    if (!o) return ''
    const mitt = (activeCohort.value?.slug || '').toLowerCase()
    return o.toLowerCase() === mitt ? '' : o
  })

  const meetings = computed(() => {
    const c = activeCohort.value
    if (!c?.club_key || !c?.slug) return []
    return REFERATER[`${c.club_key}/${c.slug}`] || []
  })
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

  return { principles, meetings, meetingsByDate, hasHandbook, hasMeetings, handbokOpphav, findPrinciple, findMeeting }
}
