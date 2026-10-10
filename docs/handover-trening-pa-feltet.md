# Handover: Trening på feltet

Design: https://claude.ai/code/artifact/3c723ba6-de29-48df-8217-3121b21664e0, rad D (D1–D5). Rad A–C er forkastede retninger og skal ikke bygges.

## Mål

Planen for økta skal være ferdig når oppmøtet er telt opp. Trenerne skal ikke dele inn spillere, fordele trenere eller finne utstyr på feltet.

## Modellen: to faser per økt

1. **Gjengene (diff-øvelsene).** Nivågrupper lages én gang per økt. Treneren har samme gjeng gjennom alle diff-øvelsene. Diff-øvelsene kjøres først.
2. **Lagene (mix-øvelsene).** Nye lag trekkes én gang når alle samles, med jevnt fordelte nivåer.

Dette er en endring fra i dag. `src/lib/grupper.js` deler inn per øvelse: antall grupper kommer fra øvelsens `per_gruppe`, og hver øvelse har sitt eget frø (`hash(nokkel)`). Ungene stokkes derfor på nytt mellom diff-øvelsene. Det skal bort.

## Regler

### Gjengene

- Rene nivåer (A, B, C) er førstevalget.
- Avviket mellom største og minste gjeng kan være opptil 3 spillere. Er det større, flyttes én spiller om gangen til nabonivået.
- A og C havner aldri i samme gjeng. Dagens diff-kutt i `lagGrupper` kan bryte dette, for eksempel når det er få eller ingen B-er.
- Antall gjenger begrenses av trenerne, se under.
- Trenger en diff-øvelse flere grupper enn det finnes gjenger (typisk Y), deles det opp inne i gjengen. Eksempel: B-gjengen kjører to Y-er med samme trener. En gjeng deles aldri på tvers.
- Trenger en diff-øvelse færre grupper, slås nabogjenger sammen, aldri A med C. Trenerne følger med gjengen sin.

### Trenerne

- Ingen gruppe uten trener. Heller større grupper.
- C har to trenere så langt det lar seg gjøre. A og B har én hver.
- Én trener rigger bare når dere er 5 eller flere (dagens `RIGGER_FRA`). Riggeren står utenfor gjengene.
- Vanlig oppsett: minst 4 trenere og 3 gjenger.

### Lagene

- Slangetrekning over nivåsortert liste, slik `lagGrupper` gjør for mix i dag. Dette er riktig og beholdes.
- Antall lag kommer fra øvelsen. To lag per bane, og trenerne fordeles per bane.
- Lagene på samme bane skal helst være like store. Går det ikke opp, står det i baneoverskriften: «en trener spiller med blå».
- Lagene navngis etter vestfarge: gul, rød, blå, grønn.

## Oppmøte etter at planen er vist

- Den som kommer for sent, havner i gjengen for sitt nivå og på det laget som gjør banene jevnest. Bekreftelsen viser hvor, for eksempel «B-gjengen hos Alex, og blått lag. Bane 2 blir 6 mot 6.» (D4)
- Den som går tidlig, tas bare ut.
- **Ingen andre flyttes på.** Dette krever at fordelingen lagres når planen vises. I dag regnes gruppene ut på nytt av oppmøtet på hver telefon, og det må endres. Forslag: lagre gjenger og lag i `training_runs.state` ved lagring, og legg nye spillere til der.

## Endre (D5)

- **Gjengene:** trykk på et navn og velg gjengen det skal flyttes til. Bare nabonivåer vises som valg. Overskriften viser hvilke øvelser endringen gjelder («Gjelder øvelse 2 og 3»). Spilleren kan også meldes borte fra arket.
- **Lagene:** ikke designet. Spør Alex før dette bygges.

## Statistikk

- Oppmøtet lagres når man trykker «Se kjøreplanen» (erstatter «Start økta»). Linjen over knappen sier det: «Oppmøtet lagres når du går videre.»
- Det lagres bare på selve treningsdagen. Andre dager vises kjøreplanen uten at noe lagres.
- «Nullstill oppmøtet» nederst i kjøreplanen sletter alt, som i dag.

## Skjermene

- **D1 Opptelling.** Spillere og trenere i et rutenett, og man trykker bort de som mangler. Riggeren er markert på trenerbrikken. Nederst står én linje («3 gjenger og 4 lag. Oppmøtet lagres når du går videre.») og knappen «Se kjøreplanen».
- **D2 Kjøreplan.** Én side, ingen ark for å lese planen. Rekkefølgen er:
  1. Gjengene: kortene, og under dem øvelsene i diff-delen.
  2. Lagene: øvelsen først, så banene med lagene.
  3. «Nullstill oppmøtet» nederst.
  - Utstyret står i metalinjen til hver øvelse, for eksempel «15 min · B har to Y-er · kjegler».
  - «21 her» øverst åpner D4.
- **D3 Øvelsen.** Ark med «Slik gjør dere det», «Se etter» og «Si til spillerne» fra øvelsesbanken. Forrige og neste øvelse nederst.
- **D4 Kom for sent.** Oppmøtearket med en bekreftelse på hvor spilleren havnet.
- **D5 Endre gjengene.** Flytt én spiller om gangen.

## Utenfor scope

- Egen visning per trener.
- Egen riggervisning eller sjekkliste.
- Klokke eller timeplan i økta.
- Låsing av oppmøte etter at treningen er over.

## Testcaser for fordelingen

| Inn | Forventet |
|---|---|
| 21 spillere (6 A, 9 B, 6 C), 5 trenere | Rigger + 3 gjenger: A (6, én trener), B (9, én trener), C (6, to trenere). Avvik 3, ingen flyttes. |
| 7 A, 0 B, 5 C, 3 gjenger | A og C aldri sammen. Ujevne gjenger godtas heller enn blanding. |
| Y-øvelse med 5 per gruppe, 21 spillere | 4 Y-er. B-gjengen har to, med samme trener. |
| 21 spillere, smålagsspill 4 mot 4 | 4 lag (5, 5, 5, 6) på 2 baner, nivåene jevnt fordelt. Bane med 5 mot 6 får merknad. |
| Adrian (B) kommer etter lagring | Inn i B-gjengen og på laget som jevner ut banene. Ingen andre flyttes. |

## Filer som berøres

- `src/lib/grupper.js`: fordeling per økt, regler for nabonivå, avviksgrense og sammenslåing.
- `src/views/OktView.vue`: ny flyt. Ikke lenger én rad per øvelse med ark, og ikke lenger tre moduser.
- `src/composables/useTreningsOkt.js`: lagring ved «Se kjøreplanen», fordelingen i `state`, sperre for treningsdag.
- `src/components/TreningsGrupper.vue`, `OppmoteGrid.vue`: gjenbruk der det passer.

## Avklart med Alex 10. okt

- **Rekkefølge:** kjøreplanen følger rekkefølgen i planen. Gjengene og lagene står øverst, så øvelsene i planlagt rekkefølge, hver med om den kjøres i gjengene, i lagene eller alle sammen.
- **Fire gjenger:** er det trenere nok (én per gjeng, to på C, og én til), deles nivået med flest spillere i to, med én trener hver.
- **Rotasjon:** trenerne roterer nivå fra trening til trening, som i dag.
- **Rigger:** egen linje under trenerne, «Rigger: Simon ›». Trykk for å velge en annen eller ingen.
- **Endre lagene:** som D5. Trykk et navn, velg et annet lag, eller meld spilleren borte.
