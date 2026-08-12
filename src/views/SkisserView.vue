<script setup>
// Skisser for skjermene i auth-prosjektet (fase 3 og 4). Ikke funksjonelle —
// hensikten er å se dem på ekte enhet, i ekte designsystem, før de bygges.
// Ruta er trener-only og ligger ikke i navigasjonen. Slettes når fase 4b er ute.
import { ref, computed } from 'vue'
import PinInput from '../components/PinInput.vue'

const GROUPS = [
  {
    label: 'Fase 3 — innlogging',
    items: [
      { id: 'epost', name: 'E-post' },
      { id: 'kode', name: 'Kode' },
      { id: 'kode-feil', name: 'Kode — feil' },
      { id: 'ikke-invitert', name: 'Ikke invitert' },
      { id: 'uten-kull', name: 'Konto uten kull' },
      { id: 'callback', name: 'Magic link — venter' },
      { id: 'callback-feil', name: 'Magic link — feilet' }
    ]
  },
  {
    label: 'Fase 4a — plattform',
    items: [
      { id: 'plattform-tomt', name: 'Ingen kull ennå' },
      { id: 'plattform', name: 'Klubber og kull' },
      { id: 'nytt-kull', name: 'Nytt kull' },
      { id: 'kullvelger', name: 'Bytt kull' }
    ]
  },
  {
    label: 'Fase 4b — tilgang',
    items: [
      { id: 'tilgang-tomt', name: 'Kull uten medlemmer' },
      { id: 'tilgang', name: 'Medlemmer' },
      { id: 'inviter', name: 'Inviter' },
      { id: 'lagpreferanse', name: 'Lagpreferanse' }
    ]
  }
]

const flat = GROUPS.flatMap(g => g.items)
const current = ref('epost')
const index = computed(() => flat.findIndex(s => s.id === current.value))
const currentName = computed(() => flat[index.value]?.name ?? '')

function step(delta) {
  const next = (index.value + delta + flat.length) % flat.length
  current.value = flat[next].id
}

const TEAMS = [
  { slug: 'gronn', name: 'Grønn', accent: 'sage' },
  { slug: 'rod', name: 'Rød', accent: 'warm' },
  { slug: 'hvit', name: 'Hvit', accent: 'paper' }
]

const COACHES = [
  { name: 'Alex', email: 'alex@benchboss.no', status: 'active' },
  { name: 'Trond', email: 'trond@…', status: 'active' },
  { name: 'Simon', email: 'simon@…', status: 'active' },
  { name: 'Iver', email: 'iver@…', status: 'active' },
  { name: 'Jacob', email: 'jacob@…', status: 'pending', since: 'sendt for 3 dager siden' }
]

const PARENTS = [
  { name: 'Kari Nordmann', email: 'kari@…', status: 'active', team: 'Grønn' },
  { name: 'Ola Hansen', email: 'ola@…', status: 'pending', since: 'sendt i går' },
  { name: 'Siri Berg', email: 'siri@…', status: 'active', team: 'Rød' }
]
</script>

<template>
  <div class="sk">
    <!-- Velger. Ikke en del av skissene. -->
    <header class="sk__bar">
      <button type="button" class="sk__nav" aria-label="Forrige skisse" @click="step(-1)">‹</button>
      <label class="sk__select-wrap">
        <span class="ds-sr-only">Velg skisse</span>
        <select v-model="current" class="sk__select">
          <optgroup v-for="g in GROUPS" :key="g.label" :label="g.label">
            <option v-for="s in g.items" :key="s.id" :value="s.id">{{ s.name }}</option>
          </optgroup>
        </select>
      </label>
      <button type="button" class="sk__nav" aria-label="Neste skisse" @click="step(1)">›</button>
    </header>
    <p class="sk__meta">{{ index + 1 }} av {{ flat.length }} · {{ currentName }} · skisse, ikke funksjonell</p>

    <!-- ============ FASE 3 — INNLOGGING ============ -->

    <div v-if="current === 'epost'" class="auth">
      <div class="auth__inner">
        <h1 class="auth__title">BenchBoss</h1>
        <div class="ds-form-group auth__field">
          <label class="ds-label">E-post</label>
          <input class="ds-input" type="email" inputmode="email" placeholder="din@epost.no" />
        </div>
        <button class="ds-btn ds-btn--primary ds-btn--lg auth__cta">Send kode</button>
      </div>
    </div>

    <div v-else-if="current === 'kode'" class="auth">
      <div class="auth__inner">
        <h1 class="auth__title">Sjekk innboksen</h1>
        <p class="auth__sub">
          Kode sendt til <strong>alex@benchboss.no</strong>
          <button type="button" class="auth__link">Endre</button>
        </p>
        <div class="auth__pin"><PinInput :length="6" autocomplete="one-time-code" /></div>
        <button class="ds-btn ds-btn--ghost ds-btn--sm">Send på nytt om 48 s</button>
      </div>
    </div>

    <div v-else-if="current === 'kode-feil'" class="auth">
      <div class="auth__inner">
        <h1 class="auth__title">Sjekk innboksen</h1>
        <p class="auth__sub">
          Kode sendt til <strong>alex@benchboss.no</strong>
          <button type="button" class="auth__link">Endre</button>
        </p>
        <div class="auth__pin"><PinInput :length="6" :error="true" autocomplete="one-time-code" /></div>
        <p class="auth__error">Feil kode. Prøv igjen.</p>
        <button class="ds-btn ds-btn--ghost ds-btn--sm">Send på nytt</button>
      </div>
    </div>

    <div v-else-if="current === 'ikke-invitert'" class="auth">
      <div class="auth__inner">
        <h1 class="auth__title">BenchBoss</h1>
        <div class="ds-form-group auth__field">
          <label class="ds-label">E-post</label>
          <input class="ds-input ds-input--error" type="email" value="alex@feiladresse.no" />
          <p class="ds-help ds-help--error">
            Denne e-posten har ikke tilgang. Sjekk at du bruker adressen invitasjonen ble sendt til.
          </p>
        </div>
        <button class="ds-btn ds-btn--primary ds-btn--lg auth__cta">Send kode</button>
      </div>
    </div>

    <div v-else-if="current === 'uten-kull'" class="auth">
      <div class="auth__inner auth__inner--msg">
        <h1 class="auth__title">Ingen tilgang ennå</h1>
        <p class="auth__body">
          Kontoen din er ikke koblet til et lag. Ta kontakt med den som inviterte deg.
        </p>
        <button class="ds-btn ds-btn--secondary">Logg ut</button>
      </div>
    </div>

    <div v-else-if="current === 'callback'" class="auth">
      <div class="auth__inner auth__inner--msg">
        <div class="auth__spinner" aria-hidden="true"></div>
        <p class="auth__body">Logger deg inn …</p>
      </div>
    </div>

    <div v-else-if="current === 'callback-feil'" class="auth">
      <div class="auth__inner auth__inner--msg">
        <h1 class="auth__title">Lenken virket ikke</h1>
        <p class="auth__body">
          Den åpnet seg antakelig i en annen nettleser. Bruk den sekssifrede koden fra samme e-post i stedet.
        </p>
        <button class="ds-btn ds-btn--primary ds-btn--lg">Skriv inn kode</button>
      </div>
    </div>

    <!-- ============ FASE 4a — PLATTFORM ============ -->

    <div v-else-if="current === 'plattform-tomt'" class="page">
      <div class="page-header">
        <h1 class="page-header__title">Plattform</h1>
      </div>
      <div class="px-lg">
        <div class="ds-empty">
          <img
            src="/illustrations/bench-boss-feature-icons/512/admin-settings-transparent.png"
            alt=""
            class="ds-empty__illo"
          />
          <h3 class="ds-empty__title">Ingen kull ennå</h3>
          <p class="ds-empty__description">Opprett det første, så kan du fylle det før noen inviteres.</p>
          <button class="ds-btn ds-btn--primary ds-btn--lg sk-empty-cta">Nytt kull</button>
        </div>
      </div>
    </div>

    <div v-else-if="current === 'plattform'" class="page">
      <div class="page-header">
        <h1 class="page-header__title">Plattform</h1>
        <p class="page-header__subtitle">2 klubber · 3 kull</p>
      </div>
      <div class="px-lg">
        <section class="ds-card sk-club">
          <header class="sk-club__head">
            <span class="sk-club__name">Halsen IL</span>
            <span class="ds-badge ds-badge--subtle">2 kull</span>
          </header>
          <button type="button" class="sk-row">
            <span class="sk-row__main">
              <span class="sk-row__name">Halsen G2015</span>
              <span class="sk-row__sub">3 lag · 19 spillere · 5 trenere</span>
            </span>
            <span class="ds-status ds-status--active">Aktiv</span>
          </button>
          <button type="button" class="sk-row">
            <span class="sk-row__main">
              <span class="sk-row__name">Halsen G2017</span>
              <span class="sk-row__sub">Ingen medlemmer ennå</span>
            </span>
            <span class="ds-status ds-status--draft">Oppsett</span>
          </button>
        </section>

        <section class="ds-card sk-club">
          <header class="sk-club__head">
            <span class="sk-club__name">Nøtterøy IF</span>
            <span class="ds-badge ds-badge--subtle">1 kull</span>
          </header>
          <button type="button" class="sk-row">
            <span class="sk-row__main">
              <span class="sk-row__name">Nøtterøy G2016</span>
              <span class="sk-row__sub">1 trener</span>
            </span>
            <span class="ds-status ds-status--pending">Invitert</span>
          </button>
        </section>

        <button class="ds-btn ds-btn--primary ds-btn--lg sk-full">Nytt kull</button>
      </div>
    </div>

    <div v-else-if="current === 'nytt-kull'" class="page">
      <div class="page-header">
        <h1 class="page-header__title">Nytt kull</h1>
      </div>
      <div class="px-lg sk-form">
        <div class="ds-form-group">
          <label class="ds-label">Klubb</label>
          <select class="ds-select">
            <option>Halsen IL</option>
            <option>Nøtterøy IF</option>
            <option>— Ny klubb —</option>
          </select>
        </div>
        <div class="ds-form-group">
          <label class="ds-label">Navn</label>
          <input class="ds-input" value="Halsen G2017" />
        </div>
        <div class="ds-form-group">
          <label class="ds-label ds-label--optional">Årskull</label>
          <input class="ds-input" inputmode="numeric" value="2017" />
        </div>

        <div class="ds-form-group">
          <label class="ds-label">Lag</label>
          <div class="sk-teams">
            <div v-for="t in TEAMS" :key="t.slug" class="sk-team" :data-accent="t.accent">
              <span class="sk-team__dot"></span>
              <input class="ds-input sk-team__input" :value="t.name" />
              <button type="button" class="sk-team__x" :aria-label="`Fjern ${t.name}`">×</button>
            </div>
          </div>
          <button type="button" class="auth__link sk-add">Legg til lag</button>
        </div>

        <div class="ds-form-group">
          <label class="ds-label">Første sesong</label>
          <input class="ds-input" value="Høst 2026" />
        </div>

        <div class="ds-alert ds-alert--info sk-note">
          Treneren inviteres etterpå. Kullet kan stå tomt så lenge du vil.
        </div>

        <button class="ds-btn ds-btn--primary ds-btn--lg sk-full">Opprett kull</button>
      </div>
    </div>

    <div v-else-if="current === 'kullvelger'" class="page page--sheet">
      <div class="sk-sheet">
        <div class="sk-sheet__grip" aria-hidden="true"></div>
        <h2 class="sk-sheet__title">Bytt kull</h2>
        <button type="button" class="sk-row sk-row--sel">
          <span class="sk-row__main">
            <span class="sk-row__name">Halsen G2015</span>
            <span class="sk-row__sub">Trener</span>
          </span>
          <span class="sk-check" aria-hidden="true">✓</span>
        </button>
        <button type="button" class="sk-row">
          <span class="sk-row__main">
            <span class="sk-row__name">Halsen G2017</span>
            <span class="sk-row__sub">Administrator</span>
          </span>
        </button>
        <p class="sk-sheet__note">Vises bare når du hører til flere enn ett kull.</p>
      </div>
    </div>

    <!-- ============ FASE 4b — TILGANG ============ -->

    <div v-else-if="current === 'tilgang-tomt'" class="page">
      <div class="page-header">
        <h1 class="page-header__title">Tilgang</h1>
        <p class="page-header__subtitle">Halsen G2017</p>
      </div>
      <div class="px-lg">
        <div class="ds-empty">
          <img
            src="/illustrations/bench-boss-feature-icons/512/squad-players-transparent.png"
            alt=""
            class="ds-empty__illo"
          />
          <h3 class="ds-empty__title">Ingen medlemmer ennå</h3>
          <p class="ds-empty__description">Du er alene her. Inviter den første treneren når kullet er klart.</p>
          <button class="ds-btn ds-btn--primary ds-btn--lg sk-empty-cta">Inviter</button>
        </div>
      </div>
    </div>

    <div v-else-if="current === 'tilgang'" class="page">
      <div class="page-header">
        <h1 class="page-header__title">Tilgang</h1>
        <p class="page-header__subtitle">Halsen G2015 · 5 trenere · 3 foreldre</p>
      </div>
      <div class="px-lg">
        <p class="sk-eyebrow">Trenere</p>
        <section class="ds-card sk-list">
          <div v-for="c in COACHES" :key="c.name" class="sk-member">
            <span class="sk-member__main">
              <span class="sk-row__name">{{ c.name }}</span>
              <span class="sk-row__sub">
                {{ c.email }}<template v-if="c.since"> · {{ c.since }}</template>
              </span>
            </span>
            <span :class="['ds-status', c.status === 'active' ? 'ds-status--active' : 'ds-status--pending']">
              {{ c.status === 'active' ? 'Aktiv' : 'Invitert' }}
            </span>
          </div>
        </section>

        <p class="sk-eyebrow">Foreldre</p>
        <section class="ds-card sk-list">
          <div v-for="p in PARENTS" :key="p.name" class="sk-member">
            <span class="sk-member__main">
              <span class="sk-row__name">{{ p.name }}</span>
              <span class="sk-row__sub">
                {{ p.email }}<template v-if="p.team"> · {{ p.team }}</template>
                <template v-if="p.since"> · {{ p.since }}</template>
              </span>
            </span>
            <span :class="['ds-status', p.status === 'active' ? 'ds-status--active' : 'ds-status--pending']">
              {{ p.status === 'active' ? 'Aktiv' : 'Invitert' }}
            </span>
          </div>
        </section>

        <button class="ds-btn ds-btn--primary ds-btn--lg sk-full">Inviter</button>
      </div>
    </div>

    <div v-else-if="current === 'inviter'" class="page page--sheet">
      <div class="sk-sheet">
        <div class="sk-sheet__grip" aria-hidden="true"></div>
        <h2 class="sk-sheet__title">Inviter</h2>
        <div class="ds-form-group">
          <label class="ds-label">Navn</label>
          <input class="ds-input" placeholder="Fornavn" />
        </div>
        <div class="ds-form-group">
          <label class="ds-label">E-post</label>
          <input class="ds-input" type="email" inputmode="email" placeholder="navn@epost.no" />
        </div>
        <div class="ds-form-group">
          <label class="ds-label">Rolle</label>
          <div class="ds-pills">
            <button type="button" class="ds-pill ds-pill--active">Trener</button>
            <button type="button" class="ds-pill">Forelder</button>
          </div>
        </div>
        <div class="ds-form-group">
          <label class="ds-label ds-label--optional">Følger lag</label>
          <select class="ds-select">
            <option>Ingen</option>
            <option v-for="t in TEAMS" :key="t.slug">{{ t.name }}</option>
          </select>
        </div>
        <button class="ds-btn ds-btn--primary ds-btn--lg sk-full">Send invitasjon</button>
      </div>
    </div>

    <div v-else-if="current === 'lagpreferanse'" class="page page--sheet">
      <div class="sk-sheet">
        <div class="sk-sheet__grip" aria-hidden="true"></div>
        <h2 class="sk-sheet__title">Hvilket lag følger du?</h2>
        <p class="sk-sheet__note sk-sheet__note--top">Du ser alle lagene uansett. Vi åpner bare på ditt.</p>
        <div class="sk-pick">
          <button
            v-for="t in TEAMS"
            :key="t.slug"
            type="button"
            class="sk-pick__card"
            :data-accent="t.accent"
          >
            <span class="sk-pick__dot"></span>
            <span class="sk-pick__name">{{ t.name }}</span>
          </button>
        </div>
        <button class="ds-btn ds-btn--ghost">Hopp over</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---- Velger (ikke del av skissene) ---- */
.sk { min-height: 100dvh; background: var(--ds-color-bg); }
.sk__bar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: var(--ds-space-sm);
  padding: var(--ds-space-sm) var(--ds-space-md);
  background: var(--ds-color-bg-elevated);
  border-bottom: 1px solid var(--ds-color-border-light);
}
.sk__nav {
  flex: none; width: 36px; height: 36px;
  border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated); color: var(--ds-color-text-secondary);
  font-size: 20px; line-height: 1; cursor: pointer;
}
.sk__select-wrap { flex: 1; min-width: 0; }
.sk__select {
  width: 100%; height: 36px; padding: 0 var(--ds-space-sm);
  border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated); color: var(--ds-color-text-primary);
  font: inherit; font-size: var(--ds-text-sm);
}
.sk__meta {
  margin: 0; padding: var(--ds-space-xs) var(--ds-space-md) 0;
  font-size: var(--ds-text-xs); color: var(--ds-color-text-tertiary);
}

/* ---- Innloggingsflatene ---- */
.auth {
  min-height: calc(100dvh - 92px);
  display: flex; align-items: center; justify-content: center;
  padding: var(--ds-space-2xl) var(--ds-space-lg);
}
.auth__inner {
  width: 100%; max-width: 380px;
  display: flex; flex-direction: column; align-items: stretch;
  gap: var(--ds-space-xl);
}
.auth__inner--msg { align-items: center; text-align: center; }
.auth__title {
  margin: 0; text-align: center;
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-3xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  color: var(--ds-color-text-primary);
}
.auth__sub {
  margin: calc(var(--ds-space-lg) * -1) 0 0; text-align: center;
  font-size: var(--ds-text-sm); color: var(--ds-color-text-secondary);
}
.auth__body {
  margin: 0; max-width: 30ch;
  font-size: var(--ds-text-md); color: var(--ds-color-text-secondary);
  line-height: 1.5;
}
.auth__link {
  margin-left: 6px; padding: 0; border: 0; background: transparent;
  color: var(--ds-color-accent); font: inherit; font-weight: var(--ds-weight-semibold);
  cursor: pointer; text-decoration: underline;
}
.auth__field { margin: 0; }
.auth__cta { width: 100%; }
.auth__pin { display: flex; justify-content: center; }
.auth__error {
  margin: calc(var(--ds-space-lg) * -1) 0 0; text-align: center;
  font-size: var(--ds-text-sm); color: var(--ds-color-error);
}
.auth__spinner {
  width: 28px; height: 28px; border-radius: 50%;
  border: 2.5px solid var(--ds-color-border);
  border-top-color: var(--ds-color-accent);
  animation: sk-spin 0.8s linear infinite;
}
@keyframes sk-spin { to { transform: rotate(360deg); } }

/* ---- Sider ---- */
.page { padding-bottom: var(--ds-space-3xl); }
.page--sheet {
  min-height: calc(100dvh - 92px);
  display: flex; align-items: flex-end;
  background: var(--ds-color-bg-sunken);
}

.sk-full { width: 100%; margin-top: var(--ds-space-lg); }
.sk-empty-cta { margin-top: var(--ds-space-lg); }
.sk-form { display: flex; flex-direction: column; gap: var(--ds-space-lg); }
.sk-note { margin: 0; }
.sk-add { margin-top: var(--ds-space-sm); align-self: flex-start; }

.sk-eyebrow {
  margin: var(--ds-space-xl) 0 var(--ds-space-sm);
  font-size: var(--ds-text-xs); font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}
.sk-eyebrow:first-of-type { margin-top: 0; }

.sk-club { margin-bottom: var(--ds-space-md); padding: 0; overflow: hidden; }
.sk-club__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--ds-space-md) var(--ds-space-lg);
  border-bottom: 1px solid var(--ds-color-border-light);
}
.sk-club__name {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
}

.sk-list { padding: 0; overflow: hidden; }
.sk-row, .sk-member {
  display: flex; align-items: center; gap: var(--ds-space-md);
  width: 100%; text-align: left;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: transparent; border: 0;
  border-top: 1px solid var(--ds-color-border-light);
  cursor: pointer;
}
.sk-member { cursor: default; }
.sk-row:first-child, .sk-member:first-child { border-top: 0; }
.sk-club .sk-row:first-of-type { border-top: 0; }
.sk-row__main, .sk-member__main {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
}
.sk-row__name {
  font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}
.sk-row__sub {
  font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sk-row--sel { background: var(--ds-color-bg-subtle); }
.sk-check { flex: none; color: var(--ds-color-accent); font-weight: var(--ds-weight-bold); }

/* ---- Ark ---- */
.sk-sheet {
  width: 100%;
  background: var(--ds-color-bg-elevated);
  border-top-left-radius: var(--ds-radius-2xl);
  border-top-right-radius: var(--ds-radius-2xl);
  border: 1px solid var(--ds-color-border-light);
  box-shadow: var(--ds-shadow-lg);
  padding: var(--ds-space-md) var(--ds-space-lg) calc(var(--ds-space-2xl) + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; gap: var(--ds-space-lg);
}
.sk-sheet__grip {
  width: 36px; height: 4px; border-radius: var(--ds-radius-full);
  background: var(--ds-color-border-strong); align-self: center;
  margin-bottom: var(--ds-space-sm);
}
.sk-sheet__title {
  margin: 0;
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-xl); font-weight: var(--ds-weight-bold);
  letter-spacing: var(--ds-tracking-tight);
  color: var(--ds-color-text-primary);
}
.sk-sheet__note {
  margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary);
}
.sk-sheet__note--top { margin-top: calc(var(--ds-space-lg) * -1); }

/* ---- Lagvalg ---- */
[data-accent="warm"]  { --accent-bg: #F8E8E0; --accent-text: #7A3A24; }
[data-accent="sage"]  { --accent-bg: #E2EDDE; --accent-text: #3D5C44; }
[data-accent="paper"] {
  --accent-bg: var(--ds-color-bg-elevated);
  --accent-text: var(--ds-color-text-primary);
  --accent-border: var(--ds-color-border-strong);
}
:global([data-theme="dark"] [data-accent="warm"]) { --accent-bg: #2A1E18; --accent-text: #F4C4A8; }
:global([data-theme="dark"] [data-accent="sage"]) { --accent-bg: #1A241D; --accent-text: #B5D2B0; }

.sk-pick { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
.sk-pick__card {
  display: flex; align-items: center; gap: var(--ds-space-md);
  padding: var(--ds-space-lg);
  background: var(--accent-bg); color: var(--accent-text);
  border: 1px solid var(--accent-border, transparent);
  border-radius: var(--ds-radius-lg);
  cursor: pointer; text-align: left;
}
.sk-pick__dot {
  width: 12px; height: 12px; border-radius: 50%; flex: none;
  background: var(--accent-text);
}
[data-accent="paper"] .sk-pick__dot {
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border-strong);
}
.sk-pick__name {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-lg); font-weight: var(--ds-weight-bold);
}

/* ---- Lag-rader i nytt kull ---- */
.sk-teams { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
.sk-team { display: flex; align-items: center; gap: var(--ds-space-sm); }
.sk-team__dot {
  width: 12px; height: 12px; border-radius: 50%; flex: none;
  background: var(--accent-text);
}
[data-accent="paper"] .sk-team__dot {
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border-strong);
}
.sk-team__input { flex: 1; min-width: 0; }
.sk-team__x {
  flex: none; width: 32px; height: 32px; padding: 0;
  border: 0; background: transparent; cursor: pointer;
  color: var(--ds-color-text-tertiary); font-size: 20px; line-height: 1;
}
</style>
