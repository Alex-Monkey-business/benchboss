# Fase 0 — infrastruktur

Ingen brukerendring. Ingenting av dette rører den kjørende appen.

Rekkefølgen er ikke tilfeldig: uten SMTP kan ingenting av innloggingen testes, og
uten staging testes RLS i produksjon på levende brukere midt i sesongen.

---

## 1. Ny access-token

Den i `.env.local` er tilbakekalt — riktig format, men API-et svarer `Unauthorized`.

https://supabase.com/dashboard/account/tokens → **Generate new token** → navn
`benchboss-cli`. Erstatt `SUPABASE_ACCESS_TOKEN` i `.env.local`.

Verifiser:

```bash
export $(grep SUPABASE_ACCESS_TOKEN .env.local | xargs)
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  https://api.supabase.com/v1/projects | head -c 200
```

Får du en JSON-liste med prosjekter, virker den.

---

## 2. Gmail som SMTP

Midlertidig bro. Når du kjøper et domene, byttes fire felter i dashbordet —
ingen kodeendring, ingen migrasjon, ingen må inviteres på nytt. Identiteten er
mottakerens e-post, ikke avsenderens.

1. Google-kontoen må ha 2-trinns­verifisering på. Uten det finnes ikke app-passord.
2. https://myaccount.google.com/apppasswords → lag ett, kall det `BenchBoss`.
   Du får 16 tegn. De vises **én gang**.
3. Supabase Dashboard → prosjektet → **Authentication → Emails → SMTP Settings**:

   | Felt | Verdi |
   |---|---|
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | din Gmail-adresse |
   | Password | app-passordet (16 tegn, uten mellomrom) |
   | Sender email | **samme** Gmail-adresse |
   | Sender name | `BenchBoss` |

   Gmail overskriver `From` til den autentiserte kontoen. Setter du noe annet
   som avsender, blir det stille byttet ut — ikke bruk tid på å lure på hvorfor.

4. **Skru opp rate limit.** Dette er steget folk hopper over, og det er derfor
   custom SMTP «ikke virker». Authentication → **Rate Limits** → *Emails sent
   per hour*: fra `2` til `30`. Gmails eget tak er 500 per døgn, som er rikelig.

---

## 3. Staging-prosjekt

Gratisplanen tillater to aktive prosjekter, så dette koster ingenting.

Dashboard → **New project**:

- Navn: `benchboss-staging`
- Region: **EU (Frankfurt eller Stockholm)** — appen lagrer opplysninger om
  mindreårige, og prod skal sjekkes for det samme
- Databasepassord: lagre det i passordhåndtereren, du trenger det til `db pull`

Sett opp samme SMTP der. Uten det kan ikke innloggingsflyten testes på staging,
og da tester du den i prod.

---

## 4. Redirect-allowlist

Gjøres **per prosjekt**, i dashbordet: Authentication → **URL Configuration**.
`supabase/config.toml` gjelder kun lokal `supabase start` — begge må vedlikeholdes.

Prod:

```
Site URL:  https://halsen-g2015.netlify.app
Redirect:  https://halsen-g2015.netlify.app/auth/callback
           http://localhost:5173/auth/callback
```

Staging: samme, med staging-URL-en. Bruker du deploy previews på Netlify, legg
til wildcard-mønsteret også.

Mangler en URL her, bouncer innloggingen stille til rot uten feilmelding. Det er
den mest forvirrende feilen i hele oppsettet.

---

## 5. Auth-innstillinger

Per prosjekt, Authentication → Providers → Email:

- **Enable email provider**: på
- **Confirm email**: av (engangskoden *er* bekreftelsen)
- **OTP expiry**: `600` (10 min — en 6-sifret kode som lever en time er svak)
- **OTP length**: `6`

Og Authentication → Sessions: **ikke** skru på kort refresh-token-utløp. Det er
det som lar en installert PWA overleve ukene mellom kamper.

---

## 6. E-postmalen

Authentication → Emails → **Magic Link**. Malen må inneholde **begge** —
lenken og koden kommer fra samme kall, og begge er gyldige:

```html
<h2>Logg inn i BenchBoss</h2>

<p>Koden din er:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700">{{ .Token }}</p>
<p>Den er gyldig i én time.</p>

<hr>
<p>Eller trykk her: <a href="{{ .ConfirmationURL }}">Logg inn</a></p>
<p style="color:#888;font-size:13px">
  Åpner lenken feil app, bruk koden over i stedet.
</p>
```

**Denne malen er innlogginger. Invitasjonen sender vi selv** gjennom Resend
(`supabase/functions/member-admin/invite-mail.ts`) — «Velkommen til BenchBoss»
med kode og lenke, laget med `generateLink` som ikke sender noe av seg selv.
Krever hemmeligheten `RESEND_API_KEY` på prosjektet:

```
npx supabase secrets set RESEND_API_KEY=... INVITE_FROM='BenchBoss <ikke-svar@benchboss.no>'
```

Mangler nøkkelen, faller invitasjonen tilbake på malen under — en invitasjon
som ikke kommer fram er verre enn en med feil overskrift. Fallbacken logges i
funksjonsloggen. Se den i nettleseren med
`node scripts/invitasjon-forhandsvisning.mjs ut.html`.

**Malen under er også fallbacken.** «Invite»-malen brukes ikke lenger:
`inviteUserByEmail` lager en lenke som dør i det kontoen bekreftes, og uten
bekreftelse er kodeveien stengt (disable_signup). `member-admin` oppretter
derfor kontoen ferdig bekreftet og sender denne e-posten i stedet — den som
har både lenke og kode, og som personen kan be om på nytt selv fra /login.

**Levetiden settes i Authentication → Providers → Email → «Email OTP
Expiration»**, og gjelder lenka og koden under ett. Står den på 3600 må også
teksten over si «én time» — en mal som lyver om utløpet sender folk til
support. Vil du ha et døgn (86400), sett `otp_length` til 8 først: 6 sifre som
lever et døgn er for svakt.

Koden står **først** med vilje. På iOS åpner magic links i Safari, ikke i den
installerte appen — da får du en sesjon i Safari og en utlogget app på
hjemskjermen. Koden er veien rundt, ikke en nødløsning.

---

## 7. Introspeksjon

Kjør `supabase/INTROSPECT.sql` i SQL Editor, mot **prod**. Read-only.

Svaret er fasit for hva som faktisk står i basen — noe de 18 løse `.sql`-filene
i repo-rota ikke kan fortelle oss. Det vi ser etter:

- Har `referees` RLS på eller av?
- Har `cup_matches.our_team` to eller fire slugs i CHECK-en?
- Finnes `players.loan_eligible` og `match_goals.clock_seconds`?
- Er `migration_ledger` tom? (Da har CLI-en aldri kjørt mot denne basen.)
- Hvilke tabeller nærmer seg 1000 rader?

Ta vare på outputen. Den er utgangspunktet for baseline-migrasjonen.

---

## 8. CLI og baseline

```bash
npx supabase login          # bruker access-tokenen
npx supabase link --project-ref <prod-ref>
npx supabase db pull        # → supabase/migrations/<ts>_remote_schema.sql
npx supabase migration list # baseline MÅ vise applied på begge sider
```

Viser ikke `migration list` baseline som applied:
`npx supabase migration repair --status applied <version>`.

**Testen som betyr noe** — spill av baseline på en fersk lokal database:

```bash
npx supabase start
npx supabase db reset       # LOKAL. Aldri --linked.
```

Kjør så appen mot `localhost:54321` og klikk gjennom `/serie`, `/serie/tropp`,
`/kamper`, `/kamp/:id`, `/statistikk`. Virker appen, er baseline tro mot prod.
Virker den ikke, fiks baseline før noe annet skjer.

> `supabase db reset --linked` sletter og gjenskaper den eksterne databasen.
> Den finnes, og den er ett flagg unna den ufarlige lokale. Regelen er enkel:
> `--linked` og `reset` skal aldri stå på samme linje.

Lokal e-post havner i Inbucket på http://localhost:54324 — ingenting sendes ut.

---

## Ferdig når

- [ ] Ny access-token virker mot Management API
- [ ] SMTP satt opp på prod **og** staging, rate limit hevet fra 2 til 30
- [ ] Staging-prosjekt finnes, i EU-region
- [ ] Prod bekreftet å ligge i EU-region
- [ ] Redirect-allowlist satt på begge prosjekter
- [ ] E-postmalen har både `{{ .Token }}` og `{{ .ConfirmationURL }}`
- [ ] `INTROSPECT.sql` kjørt mot prod, output tatt vare på
- [ ] `db pull` gjort, baseline spilt av lokalt, appen klikket gjennom
