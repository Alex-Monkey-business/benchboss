<script setup>
import { ref, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { isSupabaseConfigured } from '../supabase'
import PinInput from '../components/PinInput.vue'
import BenchBossBrand from '../components/BenchBossBrand.vue'

const route = useRoute()
const router = useRouter()
const { signInWithGoogle, sendCode, verifyCode, refreshMember, isLoggedIn, isParent, demoLogin } = useAuth()

// 'email' → 'code'. Kodeboksen er primærveien etter «send», ikke gjemt bak en
// «jeg har en kode»-lenke: e-posten inneholder både lenke og kode, og på iOS
// er koden den eneste som virker når PWA-en og Safari er ulike nettlesere.
// iOS gir en hjemskjerm-app sin egen lagringsboks, adskilt fra Safari. Lenken
// i e-posten åpner alltid Safari, så sesjonen havner DER og denne appen står
// igjen utlogget — en stille suksess på feil sted, som er verre enn en feil.
//
// E-postmalen er den samme for alle og kan ikke vite hvem som får den. Men
// appen vet hvilken enhet den kjører på i det du ber om koden. Så advarselen
// hører hjemme her, ikke i e-posten til de andre nitti prosentene.
const isIosStandalone = (() => {
  const ua = navigator.userAgent || ''
  // iPadOS utgir seg for å være Mac; berøringspunkter avslører den.
  const isIos = /iP(hone|od|ad)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const standalone = window.navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true
  return isIos && standalone
})()

const step = ref('email')
// ?epost=1 kommer fra en utløpt lenke: da vil personen ha en ny e-post, og
// feltet står åpent med en gang.
const showEmail = ref(route.query.epost === '1')
const googleBusy = ref(false)
async function onGoogle() {
  if (googleBusy.value) return
  googleBusy.value = true
  error.value = ''
  try {
    const { error: err } = await signInWithGoogle()
    if (err) throw err
  } catch (err) {
    error.value = err?.message || 'Kunne ikke åpne Google. Bruk e-post.'
    showEmail.value = true
    googleBusy.value = false
  }
}
const email = ref('')
const sending = ref(false)
const verifying = ref(false)
const error = ref('')
const codeError = ref(false)
const pinRef = ref(null)

function redirectTarget() {
  const q = route.query.redirect
  if (typeof q === 'string' && q.startsWith('/')) return q
  return isParent.value ? '/cup' : '/'
}

function humanError(err) {
  const msg = (err?.message || '').toLowerCase()
  // To ulike koder havner her, med samme praktiske betydning for brukeren:
  //   otp_disabled     — adressen finnes ikke (shouldCreateUser: false)
  //   signup_disabled  — prosjektet nekter registrering
  //
  // Felle verdt å kjenne: `signup_disabled` treffer også en bruker som FINNES,
  // men står ubekreftet — GoTrue regner den som midt i en registrering. Derfor
  // må invitasjonen alltid opprette brukeren bekreftet (`email_confirm: true`),
  // ellers får en invitert person «har ikke tilgang» på sin egen invitasjon.
  if (msg.includes('signups not allowed') || msg.includes('otp_disabled') || msg.includes('signup_disabled')) {
    return 'Denne e-posten har ikke tilgang til BenchBoss.'
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'For mange forsøk. Vent noen minutter.'
  }
  if (msg.includes('invalid') || msg.includes('expired')) {
    return 'Koden er feil eller utløpt.'
  }
  return err?.message || 'Noe gikk galt. Prøv igjen.'
}

async function onSend() {
  if (!email.value.trim() || sending.value) return
  error.value = ''
  sending.value = true

  const { error: err } = await sendCode(email.value)
  sending.value = false

  if (err) {
    error.value = humanError(err)
    return
  }

  step.value = 'code'
  await nextTick()
  pinRef.value?.clear()
}

async function onCodeComplete(code) {
  if (verifying.value) return
  error.value = ''
  verifying.value = true

  const { error: err } = await verifyCode(email.value, code)

  if (err) {
    verifying.value = false
    codeError.value = true
    setTimeout(() => {
      codeError.value = false
      pinRef.value?.clear()
    }, 600)
    error.value = humanError(err)
    return
  }

  // Medlemsraden må være lest før vi navigerer, ellers taper vi kappløpet
  // mot router-guarden.
  await refreshMember()
  verifying.value = false

  if (!isLoggedIn.value) {
    // Innlogget, men uten medlemskap i noe kull. Dette skal være synlig og
    // ikke se ut som en feil ved innloggingen — den gikk fint.
    error.value = 'Kontoen har ingen tilgang til et kull ennå.'
    return
  }

  router.push(redirectTarget())
}

function onBackToEmail() {
  step.value = 'email'
  error.value = ''
  codeError.value = false
}

async function onResend() {
  await onSend()
}

function onDemo(role) {
  demoLogin({
    name: role === 'parent' ? 'Forelder' : 'Alex',
    role,
    coachId: role === 'parent' ? null : 'demo-1'
  })
  router.push(role === 'parent' ? '/cup' : '/')
}
</script>

<template>
  <div class="login-screen">
    <div class="login-content">
      <BenchBossBrand />
    <Transition name="step-fade" mode="out-in">

      <!-- STEG 1 — e-post -->
      <div v-if="step === 'email'" key="email" class="login-step login-step--email">
        <h1 class="login-sr-only">Logg inn på BenchBoss</h1>

        <button type="button" class="login-google" :disabled="googleBusy || sending" @click="onGoogle">
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#4285F4" d="M43.6 20.5H24v8h11.3C33.8 33.7 29.5 36 24 36a12 12 0 1 1 8.5-20.5l6-6A20.5 20.5 0 1 0 44.5 24c0-1.2-.3-2.4-.9-3.5Z"/>
            <path fill="#34A853" d="M24 44.5c5.6 0 10.5-1.8 14.1-5.1l-6.8-5.3A12 12 0 0 1 12.7 28l-7 5.4A20.5 20.5 0 0 0 24 44.5Z"/>
            <path fill="#FBBC05" d="M12.7 28a12 12 0 0 1 0-8l-7-5.4a20.5 20.5 0 0 0 0 18.8Z"/>
            <path fill="#EA4335" d="M24 12c3.3 0 6.2 1.2 8.5 3.5l6-6A20.5 20.5 0 0 0 5.7 14.6l7 5.4A12 12 0 0 1 24 12Z"/>
          </svg>
          {{ googleBusy ? 'Åpner Google…' : 'Fortsett med Google' }}
        </button>
        <button v-if="!showEmail" type="button" class="login-link" @click="showEmail = true">Annen e-post</button>
        <form v-if="showEmail" class="login-form" @submit.prevent="onSend">
          <label class="login-label" for="login-email">E-post</label>
          <input
            id="login-email"
            v-model="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            autocapitalize="off"
            spellcheck="false"
            class="login-input"
            placeholder="deg@eksempel.no"
            required
            :disabled="sending"
          />
          <button type="submit" class="login-button" :disabled="sending || !email.trim()">
            {{ sending ? 'Sender…' : (isIosStandalone ? 'Send kode' : 'Send lenke') }}
          </button>
        </form>

        <Transition name="ds-fade">
          <p v-if="error" class="login-error" role="alert">{{ error }}</p>
        </Transition>

        <div v-if="!isSupabaseConfigured" class="login-demo">
          <p class="login-demo__label">Demo-modus</p>
          <div class="login-demo__roles">
            <button type="button" class="login-demo__role" @click="onDemo('coach')">Trener</button>
            <button type="button" class="login-demo__role" @click="onDemo('admin')">Admin</button>
            <button type="button" class="login-demo__role" @click="onDemo('parent')">Forelder</button>
          </div>
        </div>
      </div>

      <!-- STEG 2 — kode -->
      <div v-else key="code" class="login-step">
        <!-- Overskriften bærer den primære handlingen, så det ikke trengs en
             ingress under. På iOS i hjemskjerm-modus er lenken feil vei, og
             da er koden det primære — ikke et alternativ. -->
        <div class="login-step__top">
          <h1 class="login-title">
            {{ isIosStandalone ? 'Kode sendt' : 'Sjekk e-posten' }}
          </h1>
          <p class="login-hint">{{ email }}</p>
          <p v-if="isIosStandalone" class="login-note">
            Ikke trykk på lenken i e-posten — den åpner Safari, ikke denne
            appen. Skriv inn koden her i stedet.
          </p>
        </div>

        <div class="login-pin">
          <p v-if="!isIosStandalone" class="login-alt">Trykk på lenken, eller skriv koden her:</p>
          <PinInput
            ref="pinRef"
            :length="6"
            :error="codeError"
            autocomplete="one-time-code"
            @complete="onCodeComplete"
          />
          <Transition name="ds-fade">
            <p v-if="error" class="login-error" role="alert">{{ error }}</p>
          </Transition>
        </div>

        <div class="login-actions">
          <button type="button" class="login-link" :disabled="sending" @click="onResend">
            {{ sending ? 'Sender…' : 'Send på nytt' }}
          </button>
          <button type="button" class="login-link" @click="onBackToEmail">Bytt e-post</button>
        </div>
      </div>

    </Transition>
    </div>
    <!-- Personvernlenka hører hjemme her og ikke bak en meny: Google krever
         den synlig for å publisere innloggingen. -->
    <p class="login-footer">
      <router-link to="/personvern" class="login-footer__lenke">Personvern</router-link>
    </p>
  </div>
</template>

<style scoped>
.login-screen {
  min-height: 100dvh;
  background: var(--ds-color-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 36px;
  padding: var(--ds-space-xl) var(--ds-space-lg) calc(var(--ds-space-xl) + env(safe-area-inset-bottom, 0px));
}

.login-step {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-2xl);
}

.login-step__top {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.login-title {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-3xl);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-tighter);
  color: var(--ds-color-text-primary);
  line-height: var(--ds-leading-tight);
  font-variation-settings: var(--ds-font-display-settings);
  margin: 0;
}

.login-hint {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  margin: 0;
}

.login-alt {
  margin: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.login-note {
  max-width: 320px;
  margin: var(--ds-space-xs) auto 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  padding: var(--ds-space-sm) var(--ds-space-md);
  background: var(--ds-color-surface);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  text-align: left;
}

.login-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.login-label {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

.login-input {
  width: 100%;
  padding: var(--ds-space-md);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-base);
  color: var(--ds-color-text-primary);
  background: var(--ds-color-surface);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  box-shadow: none;
  min-height: 54px;
}

.login-input:focus {
  outline: none;
  border-color: var(--ds-color-text-primary);
  outline: 2px solid var(--ds-color-text-primary);
  outline-offset: 3px;
}

.login-button {
  width: 100%;
  padding: var(--ds-space-md);
  margin-top: var(--ds-space-sm);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-base);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-bg);
  background: var(--ds-color-text-primary);
  border: 1px solid var(--ds-color-text-primary);
  border-radius: var(--ds-radius-md);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 180ms ease, opacity 180ms ease, background 180ms ease;
  min-height: 52px;
}

.login-button:active {
  transform: scale(0.99);
}

.login-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.login-pin {
  /* Uten denne blir beholderen innholdsbredde — en flex-item i en kolonne
     med align-items: center krymper til innholdet. Da måler kodeboksenes
     max-width: 100% seg mot seg selv og begrenser ingenting, og seks bokser
     renner utenfor kanten på 360px. Fire gjorde aldri det, så det dukket
     først opp nå. */
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-md);
}

.login-error {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-error);
  margin: 0;
  text-align: center;
}

.login-actions {
  display: flex;
  gap: var(--ds-space-lg);
}

.login-link {
  padding: var(--ds-space-xs) 0;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.login-link:disabled {
  opacity: 0.5;
  cursor: default;
}

/* ---- Demo-modus ---- */
.login-demo {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-sm);
  padding-top: var(--ds-space-lg);
  border-top: 1px solid var(--ds-color-border);
}

.login-demo__label {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  margin: 0;
}

.login-demo__roles {
  display: flex;
  gap: var(--ds-space-sm);
}

.login-demo__role {
  padding: var(--ds-space-sm) var(--ds-space-md);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  background: var(--ds-color-surface);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  cursor: pointer;
}

.login-content { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 44px; margin-block: auto; padding-block: 38px; }
.login-footer { margin: 0; color: var(--ds-color-text-secondary); font-size: 12px; letter-spacing: .01em; }
.login-footer__lenke { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.login-footer__lenke:hover { color: var(--ds-color-text-primary); }
.login-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.login-button:hover:not(:disabled) { opacity: .85; }
.login-link, .login-demo__role { min-height: 44px; }
.login-link:focus-visible, .login-button:focus-visible, .login-demo__role:focus-visible { outline: 2px solid var(--ds-color-text-primary); outline-offset: 4px; }
.login-hint { overflow-wrap: anywhere; }
@media (max-height: 650px) { .login-content { gap: 28px; padding-block: 0; } }

/* ---- Steg-overgang ---- */
.step-fade-enter-active {
  transition:
    opacity 220ms var(--ds-ease-out),
    transform 220ms var(--ds-ease-out);
}
.step-fade-leave-active {
  transition:
    opacity 140ms var(--ds-ease-out),
    transform 140ms var(--ds-ease-out);
}
.step-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.step-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .step-fade-enter-active,
  .step-fade-leave-active {
    transition: opacity 100ms;
  }
  .step-fade-enter-from,
  .step-fade-leave-to {
    transform: none;
  }
}
</style>

<style scoped>
.login-step--email { gap: 16px; }
.login-google { display: flex; align-items: center; justify-content: center; gap: 12px; width: fit-content; max-width: 100%; padding: 0 22px; min-height: 52px; border: 1px solid var(--ds-color-border); border-radius: 10px; background: var(--ds-color-bg-elevated); color: var(--ds-color-text-primary); font: 500 15px var(--ds-font-body); cursor: pointer; transition: background 180ms, transform 180ms; }
.login-google:hover { background: var(--ds-color-bg-hover); }
.login-google:active { transform: scale(.985); }
.login-google:focus-visible { outline: 2px solid var(--ds-color-accent); outline-offset: 4px; }
.login-google:disabled { opacity: .6; cursor: wait; }
</style>
