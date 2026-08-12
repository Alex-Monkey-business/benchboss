<script setup>
import { ref, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { isSupabaseConfigured } from '../supabase'
import PinInput from '../components/PinInput.vue'

const route = useRoute()
const router = useRouter()
const { sendCode, verifyCode, refreshMember, isLoggedIn, isParent, demoLogin } = useAuth()

// 'email' → 'code'. Kodeboksen er primærveien etter «send», ikke gjemt bak en
// «jeg har en kode»-lenke: e-posten inneholder både lenke og kode, og på iOS
// er koden den eneste som virker når PWA-en og Safari er ulike nettlesere.
const step = ref('email')
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
  if (msg.includes('signups not allowed') || msg.includes('otp_disabled')) {
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
    <Transition name="step-fade" mode="out-in">

      <!-- STEG 1 — e-post -->
      <div v-if="step === 'email'" key="email" class="login-step">
        <h1 class="login-title">BenchBoss</h1>

        <form class="login-form" @submit.prevent="onSend">
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
            :disabled="sending"
          />
          <button type="submit" class="login-button" :disabled="sending || !email.trim()">
            {{ sending ? 'Sender…' : 'Send kode' }}
          </button>
        </form>

        <Transition name="ds-fade">
          <p v-if="error" class="login-error">{{ error }}</p>
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
        <div class="login-step__top">
          <h1 class="login-title">Kode sendt</h1>
          <p class="login-hint">{{ email }}</p>
        </div>

        <div class="login-pin">
          <PinInput
            ref="pinRef"
            :length="6"
            :error="codeError"
            autocomplete="one-time-code"
            @complete="onCodeComplete"
          />
          <Transition name="ds-fade">
            <p v-if="error" class="login-error">{{ error }}</p>
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
</template>

<style scoped>
.login-screen {
  min-height: 100dvh;
  background: var(--ds-color-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ds-space-xl) var(--ds-space-lg) calc(var(--ds-space-xl) + env(safe-area-inset-bottom, 0px));
}

.login-step {
  width: 100%;
  max-width: 420px;
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
  box-shadow: var(--ds-shadow-xs);
}

.login-input:focus {
  outline: none;
  border-color: var(--ds-color-border-strong);
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
  transition: transform var(--ds-duration-fast) var(--ds-ease-out);
}

.login-button:active {
  transform: scale(0.99);
}

.login-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.login-pin {
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
