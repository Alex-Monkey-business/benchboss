<script setup>
import { ref, onMounted } from 'vue'
import Spot from '../components/Spot.vue'
import BenchBossBrand from '../components/BenchBossBrand.vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase, isSupabaseConfigured } from '../supabase'
import { useAuth } from '../stores/auth'

// Mellomsteget mellom e-posten og innloggingen.
//
// Glenn fikk «Email link is invalid or has expired» på sin egen invitasjon.
// Basen fortalte hvorfor: lenka ble forbrukt 33 sekunder etter at den ble
// sendt, av Chrome på Windows — han satt på iPhone. Det var en lenkeskanner i
// bedrifts-e-posten hans, som åpner hver lenke for å sjekke den.
//
// Og det tar KODEN med seg: lenka og de seks sifrene er samme engangstoken.
// Brenner skanneren lenka, er koden i samme e-post også død. Da finnes det
// ingen vei inn i det hele tatt.
//
// Derfor logger ikke lenka inn lenger. Den åpner denne siden, som ikke gjør
// noe før noen trykker. En skanner som henter siden forbruker ingenting — den
// kan ikke trykke. Mennesket kan.
//
// Tokenet ligger i søkestrengen som `t` (GoTrue sin TokenHash). Det er samme
// hemmelighet ConfirmationURL bar på før, så eksponeringen er uendret.

const route = useRoute()
const router = useRouter()
const { refreshMember, isLoggedIn, isParent } = useAuth()

const token = String(route.query.t || '')
const type = String(route.query.type || 'magiclink')
const jobber = ref(false)
const feil = ref('')

onMounted(() => {
  if (!token) feil.value = 'Lenken mangler innloggingskoden. Be om en ny fra innloggingssiden.'
})

async function loggInn() {
  if (!token || jobber.value) return
  if (!isSupabaseConfigured) { router.replace('/login'); return }

  jobber.value = true
  feil.value = ''

  const { error } = await supabase.auth.verifyOtp({ token_hash: token, type })
  if (error) {
    jobber.value = false
    // Utløpt eller alt brukt. Koden i e-posten er da også oppbrukt, så veien
    // videre er en ny e-post — ikke å prøve denne igjen.
    feil.value = /expired|invalid/i.test(error.message || '')
      ? 'Lenken er utløpt eller allerede brukt. Be om en ny fra innloggingssiden.'
      : (error.message || 'Innloggingen feilet.')
    return
  }

  // Tokenet ut av adressefeltet før noe annet — det ligger ellers igjen i
  // historikken.
  window.history.replaceState(null, '', window.location.pathname)

  await refreshMember()
  jobber.value = false

  if (!isLoggedIn.value) {
    feil.value = 'Kontoen har ingen tilgang til et kull ennå.'
    return
  }
  router.replace(isParent.value ? '/cup' : '/')
}
</script>

<template>
  <div class="klar">
    <template v-if="feil">
      <!-- Feilen er nesten alltid en lenke som er brukt eller utløpt. -->
      <Spot name="connection" class="klar__illo" />
      <p class="klar__feil">{{ feil }}</p>
      <router-link to="/login" class="klar__lenke">Til innlogging</router-link>
    </template>

    <template v-else>
      <!-- Samme merke som innloggingssida. Appikonet med kremfarget bunn var
           det eneste stedet det gamle ikonet fortsatt sto. -->
      <BenchBossBrand />
      <!-- Merket sier alt en overskrift ville sagt. Teksten sier hvor du kom
           fra, så trykket ikke føles som et steg for mye. -->
      <h1 class="klar__skjult">Logg inn i BenchBoss</h1>
      <p class="klar__lead">Lenka fra e-posten er klar.</p>
      <button type="button" class="ds-btn ds-btn--primary klar__knapp" :disabled="jobber || !token" @click="loggInn">
        {{ jobber ? 'Logger inn …' : 'Logg inn' }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.klar {
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

.klar__illo { --spot-size: 96px; }

.klar__skjult {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.klar__lead {
  margin: 0;
  color: var(--ds-color-text-secondary);
}

.klar__knapp {
  margin-top: var(--ds-space-md);
  min-width: 220px;
}

.klar__feil {
  font-size: var(--ds-text-base);
  color: var(--ds-color-error);
  margin: 0;
  max-width: 420px;
}

.klar__lenke {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
