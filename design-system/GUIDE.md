# Design System — Brukerveiledning

Et gjenbrukbart design system basert på "Dokument+" appen. Varmt, profesjonelt uttrykk med terrakotta-aksent, serif-overskrifter (Vollkorn) og sans-serif brødtekst (Inter).

---

## Kom i gang

Importer hele systemet med én linje:

```css
/* I din main.css eller App.vue */
@import './design-system/index.css';
```

Eller importer kun det du trenger:

```css
@import './design-system/tokens/_colors.css';
@import './design-system/tokens/_typography.css';
@import './design-system/components/_buttons.css';
```

---

## Tokens (CSS Custom Properties)

Alle tokens har prefix `--ds-` for å unngå konflikter.

### Farger

| Token | Verdi | Bruk |
|-------|-------|------|
| `--ds-color-bg` | `#FAF9F7` | Sidebakgrunn |
| `--ds-color-bg-elevated` | `#FFFFFF` | Kort, dialoger |
| `--ds-color-bg-subtle` | `#F3F1EE` | Hover, dempet bakgrunn |
| `--ds-color-accent` | `#C47B5A` | Primæraksent (terrakotta) |
| `--ds-color-success` | `#5A8A6A` | Suksess/bekreftelse |
| `--ds-color-warning` | `#D4A030` | Advarsel |
| `--ds-color-error` | `#C0453A` | Feil |
| `--ds-color-info` | `#4A6FA5` | Informasjon |

### Typografi

```css
font-family: var(--ds-font-heading);  /* Vollkorn (overskrifter) */
font-family: var(--ds-font-body);     /* Inter (brødtekst) */

font-size: var(--ds-text-sm);   /* 15px */
font-size: var(--ds-text-base); /* 17px */
font-size: var(--ds-text-lg);   /* 20px */
font-size: var(--ds-text-xl);   /* 26px */
```

### Spacing

```css
padding: var(--ds-space-sm);  /* 8px  */
padding: var(--ds-space-md);  /* 16px */
padding: var(--ds-space-lg);  /* 24px */
padding: var(--ds-space-xl);  /* 32px */
```

### Radius & Shadows

```css
border-radius: var(--ds-radius-sm);  /* 8px  - knapper, inputs */
border-radius: var(--ds-radius-md);  /* 12px - mellomting */
border-radius: var(--ds-radius-lg);  /* 18px - kort */

box-shadow: var(--ds-shadow-sm);  /* subtil */
box-shadow: var(--ds-shadow-md);  /* standard */
box-shadow: var(--ds-shadow-lg);  /* fremhevet */
```

---

## Komponenter

### Knapper

```html
<button class="ds-btn ds-btn--primary">Lagre</button>
<button class="ds-btn ds-btn--secondary">Avbryt</button>
<button class="ds-btn ds-btn--ghost">Tilbake</button>
<button class="ds-btn ds-btn--confirm">Bekreft publisering</button>
<button class="ds-btn ds-btn--danger">Slett</button>

<!-- Størrelser -->
<button class="ds-btn ds-btn--primary ds-btn--sm">Liten</button>
<button class="ds-btn ds-btn--primary ds-btn--lg">Stor</button>

<!-- Med ikon -->
<button class="ds-btn ds-btn--primary">
  <svg>...</svg>
  Ny instruks
</button>

<!-- Kun ikon -->
<button class="ds-btn ds-btn--ghost ds-btn--icon">
  <svg>...</svg>
</button>
```

### Kort

```html
<div class="ds-card">
  <div class="ds-card__header">
    <h3 class="ds-card__title">Korttittel</h3>
  </div>
  <div class="ds-card__body">
    <p>Innhold her...</p>
  </div>
  <div class="ds-card__footer">
    <span class="ds-badge ds-badge--accent">Instruks</span>
  </div>
</div>

<!-- Klikkbart kort -->
<div class="ds-card ds-card--interactive">...</div>

<!-- Varianter -->
<div class="ds-card ds-card--compact">...</div>
<div class="ds-card ds-card--spacious">...</div>
```

### Badges

```html
<span class="ds-badge ds-badge--accent">Instruks</span>
<span class="ds-badge ds-badge--subtle">Håndbok</span>
<span class="ds-badge ds-badge--info">Personlig</span>
<span class="ds-badge ds-badge--success">Godkjent</span>
<span class="ds-badge ds-badge--warning">Utkast</span>
<span class="ds-badge ds-badge--error">Utløpt</span>
```

### Status-indikator

```html
<span class="ds-status ds-status--active">
  <span class="ds-status__dot"></span>
  Bekreftet
</span>

<span class="ds-status ds-status--pending">
  <span class="ds-status__dot"></span>
  Venter
</span>
```

### Skjemaer

```html
<div class="ds-form-group">
  <label class="ds-label">Tittel</label>
  <input class="ds-input" type="text" placeholder="Skriv inn tittel...">
</div>

<div class="ds-form-group">
  <label class="ds-label ds-label--optional">Beskrivelse</label>
  <textarea class="ds-input" placeholder="Valgfri beskrivelse..."></textarea>
  <span class="ds-help">Maks 500 tegn</span>
</div>

<!-- Feilmelding -->
<div class="ds-form-group">
  <label class="ds-label">E-post</label>
  <input class="ds-input ds-input--error" type="email">
  <span class="ds-help ds-help--error">Ugyldig e-postadresse</span>
</div>

<!-- Avkrysning -->
<label class="ds-checkbox">
  <input type="checkbox">
  Jeg godtar vilkårene
</label>

<!-- Side ved side -->
<div class="ds-form-row">
  <div class="ds-form-group">
    <label class="ds-label">Fornavn</label>
    <input class="ds-input" type="text">
  </div>
  <div class="ds-form-group">
    <label class="ds-label">Etternavn</label>
    <input class="ds-input" type="text">
  </div>
</div>
```

### Filter-pills

```html
<div class="ds-pills">
  <button class="ds-pill ds-pill--active">
    Alle <span class="ds-pill__count">12</span>
  </button>
  <button class="ds-pill">Instrukser</button>
  <button class="ds-pill">Håndbøker</button>
</div>
```

### Dialog / Modal

```html
<div class="ds-overlay">
  <div class="ds-dialog">
    <div class="ds-dialog__header">
      <h3 class="ds-dialog__title">Bekreft handling</h3>
      <button class="ds-dialog__close">&times;</button>
    </div>
    <div class="ds-dialog__body">
      <p>Er du sikker på at du vil fortsette?</p>
    </div>
    <div class="ds-dialog__footer">
      <button class="ds-btn ds-btn--secondary">Avbryt</button>
      <button class="ds-btn ds-btn--primary">Bekreft</button>
    </div>
  </div>
</div>
```

### Toast

```html
<div class="ds-toast-container">
  <div class="ds-toast ds-toast--success">
    Dokumentet er lagret
  </div>
</div>
```

### Stepper

```html
<div class="ds-stepper">
  <div class="ds-step ds-step--done">
    <span class="ds-step__number">1</span>
    <span class="ds-step__label">Type</span>
  </div>
  <div class="ds-step ds-step--active">
    <span class="ds-step__number">2</span>
    <span class="ds-step__label">Innhold</span>
  </div>
  <div class="ds-step">
    <span class="ds-step__number">3</span>
    <span class="ds-step__label">Publiser</span>
  </div>
</div>
```

### Alerts

```html
<div class="ds-alert ds-alert--info">Informasjon her</div>
<div class="ds-alert ds-alert--success">Handlingen er fullført</div>
<div class="ds-alert ds-alert--warning">Vær oppmerksom på dette</div>
<div class="ds-alert ds-alert--error">Noe gikk galt</div>
<div class="ds-alert ds-alert--tip">Tips: Du kan bruke hurtigtaster</div>
```

### Empty State

```html
<div class="ds-empty">
  <img class="ds-empty__image" src="illustration.svg" alt="">
  <h3 class="ds-empty__title">Ingen dokumenter ennå</h3>
  <p class="ds-empty__description">
    Opprett din første instruks for å komme i gang.
  </p>
  <div class="ds-empty__action">
    <button class="ds-btn ds-btn--primary">Opprett ny</button>
  </div>
</div>
```

---

## Layout-utilities

```html
<!-- Container -->
<div class="ds-container">...</div>

<!-- Grid -->
<div class="ds-grid ds-grid--3">
  <div class="ds-card">...</div>
  <div class="ds-card">...</div>
  <div class="ds-card">...</div>
</div>

<!-- Flex -->
<div class="ds-flex ds-flex--between ds-gap-md">
  <h2>Tittel</h2>
  <button class="ds-btn ds-btn--primary">Handling</button>
</div>

<!-- Stack (vertikal spacing) -->
<div class="ds-stack">
  <p>Avsnitt 1</p>
  <p>Avsnitt 2</p>
  <p>Avsnitt 3</p>
</div>

<!-- Responsiv skjuling -->
<span class="ds-hide-mobile">Kun desktop</span>
<span class="ds-hide-desktop">Kun mobil</span>
```

---

## Animasjoner

### Vue Transitions

```html
<Transition name="ds-fade">
  <div v-if="visible">Innhold</div>
</Transition>

<Transition name="ds-slide-up">...</Transition>
<Transition name="ds-dropdown">...</Transition>
<Transition name="ds-toast">...</Transition>
<Transition name="ds-scale">...</Transition>
<Transition name="ds-dialog">...</Transition>
```

### CSS-animasjoner

```html
<!-- Fade up med stagger -->
<div class="ds-anim-fade-up ds-anim-delay-1">Første</div>
<div class="ds-anim-fade-up ds-anim-delay-2">Andre</div>
<div class="ds-anim-fade-up ds-anim-delay-3">Tredje</div>

<!-- Loading spinner -->
<svg class="ds-anim-spin">...</svg>
```

### Easing-variabler

```css
transition: all 0.2s var(--ds-ease-smooth);   /* Jevn */
transition: all 0.2s var(--ds-ease-bounce);   /* Sprett */
transition: all 0.2s var(--ds-ease-pop);      /* Pop */
```

---

## Responsivt design

Breakpoints brukt i systemet:

| Breakpoint | Bredde | Bruk |
|------------|--------|------|
| Desktop | > 768px | Standard visning |
| Tablet/Mobil | <= 768px | Stacked grid, mindre padding |
| Liten mobil | <= 480px | Skjul stepper-labels |
| Meny-breakpoint | <= 700px | Hamburger-meny |

---

## Filstruktur

```
design-system/
├── index.css                  ← Importer denne
├── tokens/
│   ├── _colors.css            ← Farger
│   ├── _typography.css        ← Fonter, størrelser
│   └── _spacing.css           ← Spacing, radius, shadows, z-index
├── base/
│   └── _reset.css             ← Reset og base-stiler
├── components/
│   ├── _buttons.css
│   ├── _cards.css
│   ├── _badges.css
│   ├── _forms.css
│   ├── _pills.css
│   ├── _dialog.css
│   ├── _toast.css
│   ├── _stepper.css
│   ├── _alert.css
│   └── _empty-state.css
├── utilities/
│   ├── _layout.css            ← Container, grid, flex
│   └── _animations.css        ← Transitions, keyframes
└── GUIDE.md                   ← Denne filen
```

---

## Ikoner

Systemet bruker inline SVG med disse konvensjonene:

```html
<svg width="18" height="18" viewBox="0 0 24 24"
     fill="none" stroke="currentColor"
     stroke-width="1.5" stroke-linecap="round"
     stroke-linejoin="round">
  <!-- paths here -->
</svg>
```

Ikoner arver tekstfarge via `stroke="currentColor"`.

---

## Tilgjengelighet

- `prefers-reduced-motion` støttes — animasjoner deaktiveres automatisk
- `:focus-visible` gir synlig fokus-ring
- `::selection` bruker aksentfarge
- `.ds-sr-only` for skjermleser-tekst
