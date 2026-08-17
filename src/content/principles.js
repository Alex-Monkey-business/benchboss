// Trener-håndboken for Halsen G2015.
// Korte prinsipper, ingen sjargong. Skrevet sånn at en sliten pappatrener
// kan lese ett prinsipp på 60 sekunder før trening.

export const principles = [
  {
    slug: 'glede-og-kreativitet',
    number: 1,
    accent: 'sky',
    illustration: 'ronaldinho-clay-transparent.png',
    title: 'Det skal være gøy',
    lead: 'En unge som har det gøy, kommer tilbake — og tør å prøve mer.',
    sections: [
      {
        heading: 'Hvorfor',
        body: 'En som koser seg på trening, tør å finte, prøve og bomme. En som kjeder seg, slutter — ofte før han fyller 14. Ronaldinho spilte alltid med et smil, og det er ikke tilfeldig at han ble så god.'
      },
      {
        heading: 'Slik gjør vi det',
        items: [
          'La dem prøve finter og tricks — en bomma dribling er lov',
          'Aldri kjeft når noen prøver noe som ikke går',
          'Spill mer, stå i kø mindre',
          'Spør hva som var gøyest når de går av banen'
        ]
      }
    ],
    quote: 'Den som har det gøy, slutter ikke.'
  },
  {
    slug: 'mange-touch',
    number: 2,
    accent: 'warm',
    title: 'Alle skal røre ballen mye',
    lead: 'Hvis en spiller står i kø, lærer han ingenting. Målet er at alle har ball nesten hele tida.',
    sections: [
      {
        heading: 'Hvorfor',
        body: 'Står spillerne i kø, gjør de ingenting i 70 % av tiden. De svakeste forsvinner først — de bryr seg minst om å holde plassen i køen.'
      },
      {
        heading: 'Slik gjør vi det',
        items: [
          'Flere baner som går samtidig — ikke én kø',
          'Mange baller klare, ny ball inn med en gang',
          'Aldri én ball mellom 24 spillere',
          'I oppvarming: én ball per spiller'
        ]
      }
    ],
    quote: 'Hvis det er kø, er det noe galt med øvelsen.'
  },
  {
    slug: 'nivadel-uten-a-si-det',
    number: 3,
    accent: 'sage',
    title: 'Nivådel, uten å si nivå',
    lead: 'Det høres rettferdig ut å blande alle hele tida. I praksis betyr det at de svakeste rører ballen minst.',
    sections: [
      {
        heading: 'Hvorfor',
        body: 'De beste finner løsninger uansett. De svakeste trenger mer hjelp fra trener og jevnere motstand for å tørre mer. Blander du alltid, gir du de svakeste motstanden de takler dårligst.'
      },
      {
        heading: 'Slik gjør vi det',
        items: [
          'Del i stasjoner — bruk farger eller bane-nummer, aldri "A-laget"',
          'Treneren er mest hos den svakeste gruppa',
          'Bytt litt på inndelingen så ingen blir låst',
          'Gi de svakeste regler som hjelper dem: ingen touchbegrensning, dobbelt poeng for scoring'
        ]
      }
    ],
    quote: 'Ikke alle skal alltid blandes. Det er ikke det samme som å være rettferdig.'
  },
  {
    slug: 'smaspill-er-gull',
    number: 4,
    accent: 'cornflower',
    title: 'Småspill er gull',
    lead: '2v2 og 3v3 gir mer utvikling per minutt enn nesten alt annet vi kan gjøre.',
    sections: [
      {
        heading: 'Hvorfor',
        body: 'Ingen kan gjemme seg. Alle får mange ballberøringer og mange dueller. De løper masse — uten at vi trenger å kjøre løpeøvelser. På 24 spillere får du 6 baner med 2v2 og alle er i gang samtidig.'
      },
      {
        heading: 'Slik gjør vi det',
        items: [
          '6 baner med 2 mot 2, eller 4 baner med 3 mot 3',
          'Korte kamper — 2–3 minutter',
          'Kongebane: vinnerne rykker opp, taperne ned',
          'Flere små mål — flere sjanser til å score'
        ]
      }
    ],
    quote: 'Hvis du er i tvil — 3v3.'
  },
  {
    slug: 'mikroseire',
    number: 5,
    accent: 'peach',
    title: 'De svakeste trenger små seire',
    lead: 'De svakeste er ofte redde for å feile. Da må de få lykkes ofte nok til å tørre mer.',
    sections: [
      {
        heading: 'Hvorfor',
        body: 'Når de føler at de får til noe, tør de mer. Tør de mer, lærer de mer. Klarer de ingenting, slutter de — ofte før de fyller 14. Det å holde denne følelsen i gang er kanskje vår viktigste jobb.'
      },
      {
        heading: 'Slik gjør vi det',
        items: [
          'Mindre baner, jevne motstandere',
          'Mange forsøk på det samme — repetisjon bygger trygghet',
          'Ros når de prøver, løper tilbake eller vinner ball — ikke bare når de scorer',
          'Si navnet deres. Si hva de gjorde bra, konkret.'
        ]
      }
    ],
    quote: 'Et "godt gjort, du sprang helt tilbake" betyr mer enn en scoring.'
  },
  {
    slug: 'korte-cues',
    number: 6,
    accent: 'sky',
    title: 'Si det kort. Vis det heller.',
    lead: 'Ikke "orienter deg og skap bredde". Si "se opp før du sentrer".',
    sections: [
      {
        heading: 'Hvorfor',
        body: '11-åringer lærer av å spille mye, ikke av å høre på lange forklaringer. Hvert sekund du snakker, er et sekund de ikke spiller. Maks et halvt minutt med forklaring — så er det i gang.'
      },
      {
        heading: 'Slik gjør vi det',
        items: [
          'Vis først, snakk etterpå',
          'Én ting per økt — ikke seks',
          'Korte og konkrete beskjeder: "ta med ballen fram", "bruk utsiden"',
          'Mindre til den som har ballen — coach heller de uten',
          'Ros når det skjer i kamp, ikke i pausen etterpå'
        ]
      }
    ],
    quote: 'Hvis en femåring ikke ville forstått det, sa du for mye.'
  },
  {
    slug: 'involvering-over-prestasjon',
    number: 7,
    accent: 'olive',
    title: 'Alle skal være med',
    lead: 'Vi prøver ikke å gjøre alle like gode. Vi prøver å få alle til å tørre mer.',
    sections: [
      {
        heading: 'Hvorfor',
        body: 'Mange "svake" 11-åringer tar store steg mellom 12 og 14 — men bare hvis de fortsatt har lyst til å komme på trening. Den viktigste jobben vår er å holde dem med i gjengen.'
      },
      {
        heading: 'Slik gjør vi det',
        items: [
          'Legg merke til hvem som er lite med, og fiks det neste øvelse',
          'Hvis noen ikke har skutt på mål — gi dem sjansen',
          'At de hører til betyr mer enn at de er gode',
          'Målet er at hver gutt går hjem med et godt minne'
        ]
      }
    ],
    quote: 'Dette laget er ikke 11 stjerner. Det er 24 gutter vi vil ha med videre.'
  },
  {
    slug: 'konsekvenstrappa',
    number: 8,
    accent: 'cornflower',
    title: 'Vi tar det på trappa',
    lead: 'Samme reaksjon hver gang, fra alle fem. Da vet han hva som skjer før det skjer.',
    sections: [
      {
        heading: 'Hvorfor',
        body: 'Reagerer vi ulikt fra gang til gang, lærer de ikke hva som er greit — de lærer hvem som er streng i dag. En fast trapp gjør konsekvensen forutsigbar, og da slipper vi å bli sinte for å bli hørt.'
      },
      {
        heading: 'Slik gjør vi det',
        items: [
          'Først en advarsel — kort og konkret, ikke en preken',
          'Så pause på sidelinja, med en samtale om hva som skjedde',
          'Går det ikke, avsluttes treninga for ham',
          'Han sendes aldri hjem — han blir hos oss til de andre er ferdige',
          'Ved stygge taklinger tar vi ham av før dommeren må gripe inn'
        ]
      }
    ],
    quote: 'Han skal vite hva som skjer før det skjer.'
  }
]

export function findPrinciple(slug) {
  return principles.find(p => p.slug === slug)
}
