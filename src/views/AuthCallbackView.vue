<script setup>
import { ref, onMounted } from 'vue'
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
const { refreshMember, isLoggedIn, isParent } = useAuth()

const error = ref('')

onMounted(async () => {
  if (!isSupabaseConfigured) {
    router.replace('/login')
    return
  }

  // Supabase legger også FEIL i fragmentet — utløpt lenke, brukt lenke.
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const hashError = hash.get('error_description') || hash.get('error')
  if (hashError) {
    error.value = decodeURIComponent(hashError.replace(/\+/g, ' '))
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
    error.value = 'Kontoen har ingen tilgang til et kull ennå.'
    return
  }

  router.replace(isParent.value ? '/cup' : '/')
})
</script>

<template>
  <div class="callback-screen">
    <template v-if="error">
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
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
