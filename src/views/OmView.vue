<template>
  <div class="om">
    <header class="om__top">
      <p class="om__merke">BenchBoss</p>
      <h1 class="om__title">Verktøyet for de som trener et fotballag</h1>
      <p class="om__lead">
        BenchBoss holder orden på tropper, spilletid, kamper og treningsøkter
        for ett årskull i en fotballklubb. Det er laget for trenere i
        barnefotballen, av en av dem.
      </p>
    </header>

    <section class="om__section">
      <h2 class="om__heading">Hva appen gjør</h2>
      <ul class="om__list">
        <li>
          <strong>Kamper og tropper.</strong> Sett opp lagene, meld fravær, og
          se hvem som er klare før avspark.
        </li>
        <li>
          <strong>Spilletid, mens kampen går.</strong> Start klokka, bytt
          spillere, og se hvem som har spilt for lite — underveis, ikke
          etterpå.
        </li>
        <li>
          <strong>Treningsøkter.</strong> En øvelsesbank og en trenerhåndbok
          som deles i klubben, så et nytt kull slipper å starte på null.
        </li>
        <li>
          <strong>Cup.</strong> Tropper, kamper og ansvar gjennom en hel
          turneringshelg.
        </li>
        <li>
          <strong>Regnskapet.</strong> Hvem som har lagt ut for dommer, og hva
          som skal gjøres opp når sesongen er ferdig.
        </li>
      </ul>
    </section>

    <section class="om__section">
      <h2 class="om__heading">Hvem bruker den</h2>
      <p>
        Trenerne og de som administrerer et kull. Foreldre kan få tilgang til
        troppene og kampene i sitt eget kull.
      </p>
      <p>
        Du kommer ikke inn ved å registrere deg. Noen som allerede er med i
        kullet må invitere deg, og du logger inn på adressen invitasjonen ble
        sendt til.
      </p>
    </section>

    <section class="om__section">
      <h2 class="om__heading">Om barna i appen</h2>
      <p>
        Appen lagrer navn på spillerne, hvilket lag de hører til, spilletid,
        mål og meldt fravær. Ikke fødselsdato, ikke adresse, ikke bilder, ikke
        helseopplysninger.
      </p>
      <p>
        Hvert kull ser bare sine egne spillere. Det er ikke en regel vi håper
        på — databasen nekter å levere rader fra andre kull.
      </p>
      <p>
        <router-link to="/personvern">Les hele personvernerklæringen</router-link>
      </p>
    </section>

    <section class="om__section">
      <h2 class="om__heading">Hvem som lager den</h2>
      <p>
        BenchBoss er laget av Alexander Samnøy, trener i Halsen IL, fordi
        regneark og gruppechatter ikke holdt orden på hvem som hadde spilt
        nok.
      </p>
      <p>
        Spørsmål:
        <a href="mailto:alexander.samnoy@gmail.com">alexander.samnoy@gmail.com</a>
      </p>
    </section>

    <router-link to="/login" class="om__inn">Logg inn</router-link>
  </div>
</template>

<script setup>
// Offentlig forside. Google krever en side som forklarer appen for noen som
// IKKE er logget inn — rot-domenet er appen selv, og den er bak innlogging.
// Den er også det en ny trener burde møte før innloggingsskjermen, som
// ellers forutsetter at du allerede vet hva BenchBoss er.
</script>

<style scoped>
.om {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ds-space-xl) var(--ds-space-lg) var(--ds-space-4xl);
}

.om__merke {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  margin: 0 0 var(--ds-space-md);
}

.om__title {
  font-family: var(--ds-font-display);
  font-size: clamp(2rem, 6.5vw, 2.8rem);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  line-height: 1.1;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0 0 var(--ds-space-md);
}

.om__lead {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-regular);
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--ds-color-text-secondary);
  margin: 0;
}

.om__section { margin-top: var(--ds-space-3xl); }

.om__heading {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tight);
  line-height: 1.25;
  color: var(--ds-color-text-primary);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0 0 var(--ds-space-sm);
}

.om__section p {
  font-size: var(--ds-text-base);
  line-height: 1.6;
  color: var(--ds-color-text-secondary);
  margin: 0 0 var(--ds-space-sm);
}

.om__section p:last-of-type { margin-bottom: 0; }

.om__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
}

.om__list li {
  font-size: var(--ds-text-base);
  line-height: 1.55;
  color: var(--ds-color-text-secondary);
  padding-left: var(--ds-space-md);
  border-left: 2px solid var(--ds-color-border);
}

.om__list strong {
  display: block;
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}

.om a { color: var(--ds-color-text-primary); text-decoration: underline; text-underline-offset: 2px; }

/* .om a er mer spesifikk enn en ren klasse, så knappen må matche på begge
   for ikke å arve tekstfargen og bli svart på svart. */
.om a.om__inn {
  display: inline-block;
  margin-top: var(--ds-space-3xl);
  padding: 14px var(--ds-space-xl);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-text-primary);
  color: var(--ds-color-bg);
  font-size: var(--ds-text-base);
  font-weight: var(--ds-weight-semibold);
  text-decoration: none;
}
</style>
