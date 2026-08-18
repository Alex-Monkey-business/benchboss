// Møtereferater fra trenerteamet. Kun trenere — her står spillernavn med
// vurderinger knyttet til seg. Rutene under /admin/referater har med vilje
// ingen rolle-meta, som i denne appen betyr trener-only (fail-closed).
//
// Teksten følger referatet ordrett. Punkter som IKKE er vedtak, men noe noen
// skal finne ut av, får `open: true` + `owner` = ansvarsområdet det hører til
// (se content/ansvar.js). Å peke på område i stedet for navn gjør at eieren
// følger med hvis ansvaret flyttes.

export const meetings = [
  {
    slug: 'trenermote-2026-08-16',
    date: '2026-08-16',
    title: 'Trenermøte',
    lead: 'Høstsesongen: cuper, treningsopplegg, kampprinsipper, laginndeling og sonelag.',
    sections: [
      {
        heading: 'Cuper',
        accent: 'sky',
        points: [
          {
            text: 'Én cup etter serieslutt før jul og én innendørscup i januar vurderes.',
            open: true,
            owner: 'Cup'
          },
          { text: 'Innbetalte midler brukes til ekstra cuper. Cuper midt i sesongen prioriteres ikke.' },
          {
            text: 'Vi avventer informasjon fra klubben om Danmarkscup.',
            open: true,
            owner: 'Cup'
          }
        ]
      },
      {
        heading: 'Treninger og keepertrening',
        accent: 'sage',
        points: [
          { text: 'Iver lager treningsopplegg for hele neste treningsperiode.' },
          { text: 'Fokus: frispilling, pasningsspill og lekbaserte øvelser, uten for høy belastning.' },
          { text: 'Differensiering gjøres i øvelsene. Spilldelen er som hovedregel blandet, gjerne med enkle begrensninger som antall touch eller krav om at alle er involvert.' },
          { text: 'Simon registrerer oppmøte i Hoopit.' },
          {
            text: 'Trond undersøker om klubben kan bidra med keepertrener til én ukentlig økt, fortrinnsvis lørdag. Alternativt legges keeper- og avslutningsøvelser inn på lørdagene.',
            open: true,
            owner: 'Headcoach'
          },
          {
            text: 'Det vurderes å flytte torsdagstreningen til kl. 18.00 og utvide den til 90 minutter etter serieslutt.',
            open: true,
            owner: 'Øvelser'
          }
        ]
      },
      {
        heading: 'Kampprinsipper og oppførsel',
        accent: 'warm',
        points: [
          { text: 'Defensivt skal laget være kompakt sentralt, med kantene flyttet over.' },
          { text: 'Offensivt skal vi bruke hele banebredden.' },
          {
            text: 'Vi gir mindre instruksjon til ballfører og coacher heller spillere uten ball med korte, konkrete beskjeder.',
            link: { label: 'Si det kort. Vis det heller.', to: '/trening/handbok/korte-cues' }
          },
          {
            text: 'Ved uønsket oppførsel følger vi en fast konsekvenstrapp: advarsel, pause på sidelinjen med samtale og deretter avsluttet trening. Spilleren sendes ikke hjem.',
            link: { label: 'Vi tar det på trappa', to: '/trening/handbok/konsekvenstrappa' }
          },
          {
            text: 'Ved stygge taklinger tas spilleren av banen før dommeren eventuelt må gripe inn.',
            link: { label: 'Vi tar det på trappa', to: '/trening/handbok/konsekvenstrappa' }
          }
        ]
      },
      {
        heading: 'Laginndeling og logistikk',
        accent: 'cornflower',
        points: [
          { text: 'Nåværende laginndeling beholdes, men justeres ved frafall eller tydelig skjeve kamper. Vi må forvente enkelte tap i høst.' },
          { text: 'Hvit-laget vurderes som sårbart, særlig med Emil, Petter og Torbjørn. Eremias, Helmer, Isak og Syver vurderes som stabile nøkkelspillere.' },
          { text: 'Kamper skjules i Hoopit for foreldre når spilleren ikke er tatt ut.' },
          { text: 'Ved hospitering til 2014-laget melder 2014-trenerne inn ønsket antall spillere. Trenerteamet velger spillere og sørger for rullering.' },
          { text: 'Vi tar med færre baller på kamp for å redusere tap av utstyr.' }
        ]
      },
      {
        heading: 'Sonelag',
        accent: 'olive',
        points: [
          { text: 'Sonelagsnominasjoner kommer senere i høst.' },
          { text: 'Vi nominerer bredt på øverste nivå, uten å informere foreldre eller spillere på forhånd.' }
        ]
      }
    ]
  }
]

export function findMeeting(slug) {
  return meetings.find(m => m.slug === slug)
}

// Nyeste først — et referat fra i fjor skal ikke ligge øverst.
export function meetingsByDate() {
  return [...meetings].sort((a, b) => b.date.localeCompare(a.date))
}

// Åpne punkter på tvers av seksjonene. Brukes til telleren på oversikten:
// «3 åpne tråder» er grunnen til å åpne referatet igjen i november.
export function openPoints(meeting) {
  return (meeting?.sections || []).flatMap(s => s.points.filter(p => p.open))
}
