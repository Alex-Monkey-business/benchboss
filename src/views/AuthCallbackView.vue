<script setup>
import { ref, onMounted } from 'vue'
import Spot from '../components/Spot.vue'
import { useRouter } from 'vue-router'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'

// Landingen for magic link-en.
//
// Med implicit flow kommer tokenene i URL-FRAGMENTET, og supabase-js plukker
// dem opp asynkront ved oppstart. Redirecter man med én gang, gjør man det
// før sesjonen finnes — og havner rett på innloggingsskjermen igjen, med en
// gyldig lenke som «ikke virket». Derfor venter dette viewet.

const router = useRouter()
const { refreshMember, isLoggedIn, isParent, logout } = useAuth()

const error = ref('')
// Innlogget, men uten medlemskap. Med Google som primærvei er dette ikke
// lenger et hjørnetilfelle: den vanligste årsaken er at nettleseren husket
// jobbkontoen, ikke den adressen treneren ble invitert på. Derfor er det en
// egen tilstand med adressen synlig og en vei ut — ikke en rød feilmelding
// om en innlogging som faktisk gikk helt fint.
const noAccessEmail = ref('')
// Skjermen vises også når ingen sesjon ble opprettet i det hele tatt, og da
// finnes ingen adresse å vise. Derfor en egen boolean.
const noAccess = ref(false)

async function tryAnother() {
  await logout()
  router.replace('/login')
}

onMounted(async () => {
  if (!isSupabaseConfigured) {
    router.replace('/login')
    return
  }

  // Supabase legger også FEIL i fragmentet — utløpt lenke, brukt lenke. Google
  // legger sine i QUERY-en i stedet, så begge må leses: en avbrutt innlogging
  // som bare viser en tom spinner er verre enn en feilmelding.
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const code = query.get('error') || hash.get('error')
  const desc = query.get('error_description') || hash.get('error_description')
  const errCode = query.get('error_code') || hash.get('error_code')
  const lesbar = desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : ''

  // Ingen nye brukere er et bevisst valg: den inviterte finnes allerede, laget
  // av member-admin. Den som treffer veggen er derfor nesten alltid en trener
  // som valgte jobbkontoen i stedet for adressen hun ble invitert på.
  //
  // Må stå FØR access_denied: GoTrue sender avvisningen den veien, og der
  // sendes man stille tilbake til /login uten et ord om hvorfor. Alternativet
  // er GoTrues egen tekst, «Signups not allowed for this instance» — engelsk,
  // og feil diagnose for en som VET at hun er invitert.
  if (errCode === 'signup_disabled' || /signups? not allowed/i.test(lesbar)) {
    noAccess.value = true
    return
  }

  // «access_denied» er ikke en feil. Det er noen som trykket Avbryt hos
  // Google, og de skal tilbake til knappen de kom fra — ikke møte rød tekst
  // for å ha ombestemt seg.
  if (code === 'access_denied') {
    router.replace('/login')
    return
  }

  if (code || desc) {
    error.value = lesbar || decodeURIComponent(code.replace(/\+/g, ' '))
    return
  }

  let session = null
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const { data } = await supabase.auth.getSession()
    if (data?.session) {
      session = data.session
      break
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  if (!session) {
    error.value = 'Lenken kunne ikke leses. Be om en ny kode.'
    return
  }

  // Tokenene ut av adressefeltet før noe annet skjer — de ligger ellers igjen
  // i historikken.
  window.history.replaceState(null, '', window.location.pathname)

  await refreshMember()

  if (!isLoggedIn.value) {
    noAccessEmail.value = session.user?.email || ''
    noAccess.value = true
    return
  }

  router.replace(isParent.value ? '/cup' : '/')
})
</script>

<template>
  <div class="callback-screen">
    <template v-if="noAccess">
      <Spot name="access" class="callback-illo" />
      <p v-if="noAccessEmail" class="callback-status">
        <strong>{{ noAccessEmail }}</strong> har ingen tilgang til et kull.
      </p>
      <p v-else class="callback-status">
        Kontoen du valgte har ingen tilgang til et kull.
      </p>
      <p class="callback-status">
        Er du invitert på en annen adresse, logg inn med den. Ellers spør den
        som styrer kullet.
      </p>
      <button type="button" class="callback-link" @click="tryAnother">
        Prøv en annen konto
      </button>
    </template>
    <template v-else-if="error">
      <Spot name="connection" class="callback-illo" />
      <p class="callback-error">{{ error }}</p>
      <router-link to="/login" class="callback-link">Tilbake til innlogging</router-link>
    </template>
    <p v-else class="callback-status">Logger inn…</p>
  </div>
</template>

<style scoped>
.callback-screen {
  min-height: 100dvh;
  background: var(--ds-color-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-md);
  padding: var(--ds-space-xl) var(--ds-space-lg);
  text-align: center;
}

.callback-illo { --spot-size: 96px; }

.callback-status {
  font-size: var(--ds-text-base);
  color: var(--ds-color-text-secondary);
  margin: 0;
}

.callback-error {
  font-size: var(--ds-text-base);
  color: var(--ds-color-error);
  margin: 0;
  max-width: 420px;
}

.callback-link {
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
