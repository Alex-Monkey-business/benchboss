<script setup>
// Én tilbakelenke for hele appen: 44 px høy, chevron + navnet på skjermen
// man går tilbake til. `historikk` = gå tilbake i nettleserhistorikken når
// det finnes en (f.eks. kom fra Hjem), ellers til `to`.
import { useRouter } from 'vue-router'

const props = defineProps({
  to: { type: [String, Object], required: true },
  label: { type: String, required: true },
  historikk: { type: Boolean, default: false }
})

const router = useRouter()

// RouterLink i custom-modus: én klikkhåndtering, så det aldri blir både
// router.back() og en navigasjon til `to` på samme trykk.
function klikk(e, navigate) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return
  e.preventDefault()
  if (props.historikk && window.history.state?.back) router.back()
  else navigate()
}
</script>

<template>
  <router-link v-slot="{ href, navigate }" :to="to" custom>
    <a :href="href" class="backlink" @click="klikk($event, navigate)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
      <span class="backlink__tekst">{{ label }}</span>
    </a>
  </router-link>
</template>

<style scoped>
.backlink {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 44px;
  max-width: 100%;
  margin-left: -6px;
  padding: 0 12px 0 0;
  border-radius: var(--ds-radius-full);
  color: var(--ds-color-text-secondary);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-medium);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.backlink svg { flex: none; width: 22px; height: 22px; }
.backlink__tekst { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.backlink:hover { color: var(--ds-color-text-primary); }
.backlink:focus-visible { outline: 2px solid var(--ds-color-accent); outline-offset: 2px; }
</style>
