# Handover: Trening på feltet og Del inn

Design: https://claude.ai/code/artifact/3c723ba6-de29-48df-8217-3121b21664e0. Bare siden **Flyten** gjelder. Siden **Utforsking** (rad A–E) er forkastede retninger og skal ikke bygges.

Denne erstatter forrige versjon av handoveren.

## Mål

Planen for økta skal være ferdig når oppmøtet er telt opp, og inndeling i grupper eller lag skal ta sekunder, ikke minutter, også midt i økta. Det skal være få valg og få trykk.

## Konseptet: én motor, to innganger

All inndeling går gjennom én skjerm, **Del inn**. Den har to innganger:

1. **Treningen (automatisk).** Når oppmøtet lagres, lages dagens grupper og lag med Del inn-motoren og vises i kjøreplanen. «Endre» åpner Del inn med valgene låst til planen.
2. **Hjem (fritt).** En fast «Del inn»-knapp på Hjem, bare for trenere. Den brukes til kampoppvarming, cup, eller når planen ikke passer. Resultatet lagres ikke, med mindre man trykker «Bruk som dagens grupper/lag».

Bunnmenyen endres ikke.

## Skjermene (Flyten, i rekkefølge)

| Ramme | Hva |
|---|---|
| Hjem | Kortet «Trening i dag» går til opptelling før lagring og til kjøreplanen etter. Under det ligger «Del inn» som knapp i full bredde. |
| Trening-fanen | Dagens trening øverst med «I dag»-merke og «21 her · planen er klar». |
| 17:00 Tell opp | Alle er på, man trykker bort de som mangler, også trenere. Simon er merket som rigger. Nederst: «3 grupper og 4 lag. Oppmøtet lagres når du går videre.» og knappen «Se kjøreplanen». |
| 17:03 Kjøreplanen | **Grupper** (Diff-merke), «Endre», gruppekortene og øvelsene i diff-delen. Deretter **Lag** (Mix-merke), «Endre», smålagsspillet og banene med lagene. Øverst står bare «21 her». Tilbake går til Trening-fanen. «Nullstill oppmøtet» står nederst. |
| 17:20 Kom for sent | Oppmøtearket med en bekreftelse på hvor spilleren havnet, i gruppe og på lag. |
| 17:25 Endre gruppene | Del inn låst til planen. Øverst «Gjelder øvelse 2 og 3» og «− 3 +». Trykk et navn for å flytte. Knappen heter «Ferdig». |
| 17:25 Flytt Kasper | Med et navn valgt viser bunnen bare nabonivåene som mål, pluss «Kasper er ikke her». |
| 17:50 Del inn (Grupper / Lag) | Del inn fra Hjem, se under. |
| 17:51 Etter bytte | Kjøreplanen med «Endret 17:50 av Alex» og meldingen «Dagens grupper er byttet · Angre». |
| Øvelsesarket | Uendret fra før: «Slik gjør dere det», «Se etter», «Si til spillerne», og forrige/neste. |

## Del inn-skjermen

Fra toppen og ned:

1. **Topp:** tilbake, «Del inn», og til høyre «22 spillere · 3 trenere» som lenke. Den åpner dagens oppmøte. Er det ingen trening i dag, starter den med hele kullet.
2. **«Grupper | Lag»** i full bredde. Dette er faner, og hver fane husker sitt eget resultat.
3. **«Diff | Mix»** til venstre og **«− 3 +»** til høyre, på én rad. Standard er Diff på Grupper og Mix på Lag, men det kan overstyres.
4. **Infolinje:** «Én trener i hver» på Grupper. På Lag: «2 baner, 5–6 på hvert lag» og «Trekk på nytt». «Trekk på nytt» finnes bare på Lag.
5. **Resultatet** fyller resten av skjermen og scroller.
   - Grupper: kort med nivåmerke, trener, antall og navn.
   - Lag: baner med trenere, og lag med vestfarge som navn. «+ trener» står på laget som er én færre.
6. **Bunn:** én hovedknapp, «Bruk som dagens grupper» eller «Bruk som dagens lag», etter fanen.
   - Vises bare når det er trening i dag og oppmøtet er lagret.
   - Kommer man fra «Endre», heter knappen «Ferdig».

**Når man trykker «Bruk som dagens …»:**

- Bare den delen av planen byttes. Grupper og lag regnes aldri om fordi den andre delen endres.
- Det lagres på økta og vises hos alle trenerne.
- Man havner i kjøreplanen, på den delen som ble byttet.
- Meldingen «Dagens grupper er byttet · Angre» vises i noen sekunder. Det er ingen bekreftelsesdialog.
- Under overskriften står «Endret HH:MM av Navn».

## Regler for fordelingen

### Grupper (diff)

- Rene nivåer A, B og C er førstevalget.
- Avviket mellom største og minste gruppe kan være opptil 3. Er det større, flyttes én spiller om gangen til nabonivået. A og C havner aldri sammen.
- Antall grupper styres av trenerne:
  - Ingen gruppe uten trener. Heller større grupper.
  - C har to trenere så langt det lar seg gjøre.
  - Med 4 trenere på gruppene blir det typisk 3 grupper.
- Trener og gruppe er de samme gjennom hele diff-delen.
- Trenger en øvelse flere enheter, deles det opp inne i gruppa med samme trener. Eksempel: B kjører to Y-er.

### Lag (mix)

- Slangetrekning over nivåsortert liste, som `lagGrupper` gjør for mix i dag.
- To lag per bane, med trenerne fordelt per bane.
- Lagene på samme bane skal helst være like store. Går det ikke opp, vises «+ trener» på det minste laget.

### Rigger

- Bare når det er 5 trenere eller flere. Simon er førstevalget.
- Riggeren står utenfor gruppene og vises bare på trenerbrikken i opptellingen.
- Utstyret står i metalinjen til hver øvelse. Det er ingen egen riggervisning.

## Oppmøte og statistikk

- Oppmøtet lagres når man trykker «Se kjøreplanen», og bare på selve treningsdagen. Andre dager kan man se planen uten at noe lagres.
- Den som kommer for sent, havner i gruppa for sitt nivå og på laget som jevner ut banene. **Ingen andre flyttes.** Den som går, tas bare ut.
- Fordelingen ligger lagret i `training_runs.state` og regnes ikke ut på nytt fra oppmøtet. Det er allerede påbegynt i commit `52bfbf7`.
- «Nullstill oppmøtet» sletter alt, og da teller det ikke i statistikken.
- Del inn fra Hjem uten «Bruk som dagens …» lagrer ingenting og teller ikke.

## Endringer mot dagens kode

- **Del inn som egen skjerm.** Dagens `okt-fordel` (`/trening/okt/:id/del`) blir Del inn. Den trenger en inngang fra Hjem som fungerer uten økt, og med økt i dag skal den bruke dagens oppmøte.
- **Kjøreplanen:**
  - «Del inn»-knappen i toppen fjernes.
  - «Endre» på Grupper og på Lag åpner Del inn, låst til planen.
  - Tilbake går til Trening-fanen.
- **Hjem:** «Del inn»-knappen legges under `TodayTrainingCard`, bare for trenere.
- **`grupper.js`:**
  - Regelen om nabonivå: aldri A og C sammen.
  - Avviksgrensen på 3.
  - Antall grupper fra trenerne, med to på C.
  - Lag to og to per bane.
- **Fjernes, eller bygges ikke:**
  - Trenerark
  - Egen visning per trener
  - Riggervisning
  - Diff/Mix-bryter i «Endre» fra planen
  - Svevende knapp

## Testcaser

| Inn | Forventet |
|---|---|
| 21 spillere (6 A, 9 B, 6 C), 5 trenere, Simon rigger | 3 grupper: A med Iver (6), B med Alex (9), C med Trond og Kristian (6). Avvik 3, ingen flyttes. |
| 7 A, 0 B, 5 C | A og C aldri sammen. Ujevne grupper godtas. |
| Kristian tas bort i Del inn (3 trenere) | 3 grupper, én trener i hver. C har bare Trond. |
| Y-øvelse, 5 per Y, 21 spillere | 4 Y-er. B har to, med samme trener. |
| Smålagsspill, 21 spillere, 4 lag | 5/5/5/6 på 2 baner. Banen med 5 mot 6 får «+ trener» på laget med 5. |
| Adrian (B) kommer etter lagring | Inn i B-gruppa og på laget som jevner ut banene. Ingen andre flyttes. |
| «Bruk som dagens grupper» fra Hjem | Gruppene byttes, lagene står urørt, og Angre setter tilbake. |
| Del inn en dag uten trening | Starter med hele kullet. Knappen «Bruk som dagens …» vises ikke. |

## Avklart med Alex 10. okt (fra forrige handover, fortsatt gyldig)

- **Rekkefølge:** kjøreplanen følger rekkefølgen i planen. Gruppene og lagene står øverst. Deretter kommer øvelsene i planlagt rekkefølge, hver merket med om den kjøres i gruppene, i lagene eller alle sammen. Flyten viser det vanlige tilfellet, med diff først og så mix. Denne regelen gjelder når planen blander.
- **Rotasjon:** trenerne roterer nivå fra trening til trening, som i dag.
- **Rigger:** egen linje under trenerne i opptellingen, «Rigger: Simon ›». Trykk for å velge en annen eller ingen.
- **Endre lagene:** som flyttingen på gruppene. Trykk et navn, velg et annet lag, eller meld spilleren borte. Knappen heter «Ferdig», og «Trekk på nytt» står i infolinjen.
- **Fire grupper:** avklares med Alex før det bygges. Notatet sa at nivået med flest spillere deles i to når det er trenere nok (én per gruppe, to på C og én til). Commit «Maks tre gjenger» sier tre. Bygg tre til det er avklart.

## Ordbruk

«Gjeng» er erstattet med «gruppe» overalt. Grupper er diff, lag er mix. Skjermen heter «Del inn», ikke «Del i grupper».
