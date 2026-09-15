# BenchBoss — tekstlogo / Whspr

Palett: ink #1A1A1A, cream #FFFFEB, lavender #F0D7FF.

Logoen er «bench» over «boss» i tunge, myke bokstavformer. Ingen benk, og
O-en er en vanlig rund O — fotballen på innloggingen er et eget UI-element,
ikke en del av ordmerket.

## Én kilde

`bench-boss-wordmark.png` er en ren alfamaske: bokstavformene ligger i
alfakanalen, uten farge og uten papirbakgrunn. Fargen settes der merket
brukes — i appen med `background: var(--ds-color-text-primary)` og
`mask-image`, i eksportene med `feFlood` + `feComposite`.

Derfor finnes ordmerket i én fil i stedet for én per tema og palett, og
lys/mørk følger av seg selv. Den erstattet `bench-boss-sidelinja.png`
(1,1 MB rasterbilde med papirbakgrunn og seks `feColorMatrix`-filtre for å
slå den ut igjen).

`bench-boss-favicon.svg` er BB-monogrammet og er uendret — det er godkjent
som det er.

`bench-boss-symbol.svg` er et tidligere konsept. Beholdt som referanse, ikke
i bruk.

## Regenerering

`node scripts/export-brand-icons.mjs` lager appikoner, Google-bilder,
favikoner og SVG-eksporter fra masken. Resultatet havner i
`output/branding/benchboss-text-only/`, som er git-ignorert — det er
resultatet, ikke kilden.
