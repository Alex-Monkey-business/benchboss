<template>
  <div class="personvern">
    <header class="personvern__top">
      <h1 class="personvern__title">Personvern</h1>
      <p class="personvern__lead">
        BenchBoss er laget for ett fotballkull, ikke for et marked. Vi lagrer
        det som skal til for å få laget på banen, og ingenting mer. Det meste
        handler om barn, og derfor er lista kortere enn du kanskje tror.
      </p>
    </header>

    <section class="personvern__section">
      <h2 class="personvern__heading">Om spillerne</h2>
      <ul class="personvern__list">
        <li>Navn.</li>
        <li>Hvilket lag spilleren hører til, og om hun kan spille for de andre lagene.</li>
        <li>Hvem som spilte, hvor lenge, og hvem som byttet inn og ut.</li>
        <li>Mål og resultater.</li>
        <li>Meldt fravær til en kamp.</li>
      </ul>
      <p>
        Vi lagrer ikke fødselsdato, adresse, bilde eller helseopplysninger om
        spillerne. Appen har aldri spurt om det, og kan ikke vise det.
      </p>
    </section>

    <section class="personvern__section">
      <h2 class="personvern__heading">Om de voksne</h2>
      <ul class="personvern__list">
        <li>Navn og e-postadresse. E-posten er innloggingen.</li>
        <li>Om du er trener, administrator eller forelder.</li>
        <li>Hvilke barn du er forelder til.</li>
        <li>Navn og telefonnummer til dommerne, så noen kan ringe dem.</li>
        <li>Hvem som har lagt ut dommerpenger, og hvor mye.</li>
        <li>Profilbildet ditt, hvis du velger å logge inn med Google.</li>
      </ul>
    </section>

    <section class="personvern__section">
      <h2 class="personvern__heading">Hvorfor</h2>
      <p>
        For å sette opp tropper, fordele spilletid rettferdig, vite hvem som
        kommer, og gjøre opp dommerpengene etter sesongen. Uten disse
        opplysningene gjør ikke appen noe som helst.
      </p>
    </section>

    <section class="personvern__section">
      <h2 class="personvern__heading">Hvem ser hva</h2>
      <p>
        Trenerne og administratorene i kullet ser alt som står over. Foreldre
        ser troppene, kampene og spilletiden — det er hele poenget med at
        appen finnes.
      </p>
      <p>
        Møtereferatene fra trenermøtene ser bare trenerne, fordi det er der
        enkeltspillere blir omtalt.
      </p>
      <p>
        Er du med i ett kull, når du bare det kullet. Det er ikke en regel vi
        har skrevet ned og håper på — databasen selv nekter å levere rader fra
        andre kull, uansett hva appen skulle finne på å spørre om.
      </p>
      <p>
        Vi selger ingenting videre, og deler ingenting med andre klubber eller
        med Halsen sentralt.
      </p>
    </section>

    <section class="personvern__section">
      <h2 class="personvern__heading">Hva vi teller</h2>
      <p>
        Vi teller sidevisninger for å se hva som faktisk brukes. Tellingen vet
        ikke hvem du er: den lagrer ingen identifikator, setter ingen cookies
        og bruker ingen tredjepart. Den grupperer besøk etter en grov verdi —
        dagens dato, nettlesertype, språk og omtrentlig skjermbredde — som
        mange mennesker deler, og som skifter hver natt.
      </p>
      <p>
        Vi lagrer også om appen ble åpnet fra hjemskjermen eller i en
        nettleser, og tekniske feilmeldinger når noe krasjer. Feilmeldingene
        går til vår egen database, ikke til en feilrapporteringstjeneste —
        nettopp fordi dette er en app om barn.
      </p>
      <p>
        Vil du ikke telles, åpne
        <a href="/?sporing=av">benchboss.no/?sporing=av</a>. Valget lagres i
        nettleseren din, og må gjøres på hver enhet du bruker.
      </p>
    </section>

    <section class="personvern__section">
      <h2 class="personvern__heading">Hvem hjelper oss med driften</h2>
      <p>Appen kjører hos noen få leverandører som behandler opplysningene på våre vilkår:</p>
      <ul class="personvern__list">
        <li>Supabase lagrer databasen og håndterer innloggingen. Serverne står i EU.</li>
        <li>Netlify leverer selve nettsiden.</li>
        <li>Resend sender e-postene våre, som innloggingslenker og koder.</li>
        <li>Google, men bare hvis du selv velger å logge inn med Google-kontoen din.</li>
      </ul>
    </section>

    <section class="personvern__section">
      <h2 class="personvern__heading">I nettleseren din</h2>
      <p>
        Når du logger inn, lagres et innloggingsbevis lokalt hos deg, slik at
        du slipper å logge inn på nytt hver gang. Det er alt. Vi setter ingen
        sporingsinformasjonskapsler.
      </p>
    </section>

    <section class="personvern__section">
      <h2 class="personvern__heading">Hvor lenge</h2>
      <p>
        Så lenge kullet er i drift. Slutter spilleren på laget, kan du be om at
        hun og opplysningene om henne slettes. Dommerregnskapet beholder vi til
        sesongen er gjort opp, så ingen betaler dobbelt.
      </p>
    </section>

    <section class="personvern__section">
      <h2 class="personvern__heading">Rettighetene dine</h2>
      <p>
        Du kan se, rette og slette opplysningene om deg — og om barnet ditt, på
        barnets vegne. Si fra til en av trenerne, så ordner vi det.
      </p>
      <p>
        Mener du vi behandler opplysninger feil, kan du klage til Datatilsynet.
      </p>
    </section>

    <section class="personvern__section">
      <h2 class="personvern__heading">Kontakt</h2>
      <p>
        Alexander Samnøy,
        <a href="mailto:alexander.samnoy@gmail.com">alexander.samnoy@gmail.com</a>
      </p>
      <p class="personvern__stamp">Sist oppdatert 15. september 2026.</p>
    </section>

    <router-link to="/login" class="personvern__back">Til innloggingen</router-link>
  </div>
</template>

<script setup>
// Offentlig side. Google krever en personvernlenke for å publisere
// innloggingen, og personopplysningsloven krever den fordi appen lagrer navn
// på barn. Den skal kunne leses uten å logge inn — en forelder som lurer på
// hva vi vet, skal ikke måtte gi fra seg noe for å finne det ut.
</script>

<style scoped>
.personvern {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ds-space-xl) var(--ds-space-lg) var(--ds-space-4xl);
}

.personvern__top {
  margin-bottom: var(--ds-space-2xl);
}

.personvern__title {
  font-family: var(--ds-font-display);
  font-size: clamp(2rem, 6.5vw, 2.8rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.1;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0 0 var(--ds-space-md);
}

.personvern__lead {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-regular);
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-secondary);
  margin: 0;
}

.personvern__section {
  margin-top: var(--ds-space-3xl);
}

.personvern__heading {
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tight);
  line-height: 1.25;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0 0 var(--ds-space-sm);
}

.personvern__section p {
  font-size: var(--ds-text-base);
  line-height: 1.6;
  color: var(--ds-color-text-secondary);
  margin: 0 0 var(--ds-space-sm);
}

.personvern__section p:last-of-type { margin-bottom: 0; }

.personvern__list {
  margin: 0 0 var(--ds-space-sm);
  padding-left: 1.15em;
  list-style: disc;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.personvern__list li::marker { color: var(--ds-color-text-tertiary); }

.personvern__list li {
  font-size: var(--ds-text-base);
  line-height: 1.55;
  color: var(--ds-color-text-secondary);
}

.personvern a {
  color: var(--ds-color-text-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.personvern__stamp {
  font-size: var(--ds-text-sm) !important;
  color: var(--ds-color-text-tertiary) !important;
}

.personvern__back {
  display: inline-block;
  margin-top: var(--ds-space-2xl);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
}

.personvern__back:hover { color: var(--ds-color-text-primary); }
</style>
