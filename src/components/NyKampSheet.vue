<script setup>
import { ref, computed, watch } from 'vue'
import Sheet from './Sheet.vue'
import { useSeasonTeams } from '../composables/useSeasonTeams'
import { useNyKamp, KAMPTYPER } from '../composables/useNyKamp'
import { useToast } from '../composables/useToast'
import { useAuth } from '../stores/auth'

const props = defineProps({
  show: { type: Boolean, default: false },
  seasonId: { type: String, default: null }
})
const emit = defineEmits(['close'])

const { seasonTeams } = useSeasonTeams()
const { preferredTeam } = useAuth()
const { leggTilKamp } = useNyKamp()
const { show: showToast } = useToast()

const lagSlug = ref('')
const motstander = ref('')
const hjemme = ref(true)
const dato = ref('')
const tid = ref('')
const type = ref('treningskamp')
const lagrer = ref(false)

// Lokal dato, ikke UTC: rett etter midnatt ville toISOString gitt gårsdagen.
function iDag() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const lag = computed(() => seasonTeams.value.find(t => t.slug === lagSlug.value) || null)

// Det du skrev, står til kampen er lagt til: et trykk utenfor arket skal
// ikke koste deg motstanderen og tida. Etter «Legg til kamp» tømmes det
// (lag og type huskes).
let tom = true
watch(() => props.show, apen => {
  if (!apen) return
  const slugs = seasonTeams.value.map(t => t.slug)
  if (!slugs.includes(lagSlug.value)) {
    lagSlug.value = slugs.includes(preferredTeam.value) ? preferredTeam.value : (slugs[0] || '')
  }
  if (!tom && dato.value) return
  tom = false
  motstander.value = ''
  dato.value = iDag()
  tid.value = ''
  hjemme.value = true
})


const klar = computed(() => !!(props.seasonId && motstander.value.trim() && dato.value && !lagrer.value))

async function lagre() {
  if (!klar.value) return
  lagrer.value = true
  const kamp = await leggTilKamp({
    seasonId: props.seasonId,
    lag: lag.value,
    motstander: motstander.value,
    hjemme: hjemme.value,
    dato: dato.value,
    tid: tid.value,
    type: type.value
  })
  lagrer.value = false
  if (!kamp) { showToast('Kunne ikke lagre kampen', 'error'); return }
  tom = true
  showToast('Kampen er lagt til', 'success')
  emit('close')
}
</script>

<template>
  <Sheet :show="show" title="Ny kamp" @close="emit('close')">
    <div class="nk">
      <div v-if="seasonTeams.length > 1" class="nk__felt">
        <span class="ds-label">Lag</span>
        <div class="ds-pills nk__pills" role="group" aria-label="Lag">
          <button
            v-for="t in seasonTeams"
            :key="t.slug"
            type="button"
            :class="['ds-pill', { 'ds-pill--active': lagSlug === t.slug }]"
            :aria-pressed="lagSlug === t.slug ? 'true' : 'false'"
            @click="lagSlug = t.slug"
          >{{ t.name }}</button>
        </div>
      </div>

      <div class="nk__felt">
        <label class="ds-label" for="nk-motstander">Motstander</label>
        <input
          id="nk-motstander"
          v-model="motstander"
          class="ds-input"
          autocomplete="off"
          enterkeyhint="done"
          placeholder="f.eks. Stag"
          @keydown.enter="lagre"
        />
      </div>

      <div class="nk__felt">
        <span class="ds-label">Hvor</span>
        <div class="ds-pills nk__pills" role="group" aria-label="Hjemme eller borte">
          <button type="button" :class="['ds-pill', { 'ds-pill--active': hjemme }]" :aria-pressed="hjemme ? 'true' : 'false'" @click="hjemme = true">Hjemme</button>
          <button type="button" :class="['ds-pill', { 'ds-pill--active': !hjemme }]" :aria-pressed="!hjemme ? 'true' : 'false'" @click="hjemme = false">Borte</button>
        </div>
      </div>

      <div class="ds-form-row nk__tid">
        <div class="nk__felt">
          <label class="ds-label" for="nk-dato">Dato</label>
          <input id="nk-dato" v-model="dato" type="date" lang="nb-NO" class="ds-input" />
        </div>
        <div class="nk__felt">
          <label class="ds-label ds-label--optional" for="nk-tid">Tid</label>
          <input id="nk-tid" v-model="tid" type="time" lang="nb-NO" class="ds-input" />
        </div>
      </div>

      <div class="nk__felt">
        <span class="ds-label">Type</span>
        <div class="ds-pills nk__pills" role="group" aria-label="Type kamp">
          <button
            v-for="k in KAMPTYPER"
            :key="k.verdi"
            type="button"
            :class="['ds-pill', { 'ds-pill--active': type === k.verdi }]"
            :aria-pressed="type === k.verdi ? 'true' : 'false'"
            @click="type = k.verdi"
          >{{ k.navn }}</button>
        </div>
      </div>

      <button type="button" class="ds-btn ds-btn--primary nk__lagre" :disabled="!klar" @click="lagre">
        {{ lagrer ? 'Lagrer …' : 'Legg til kamp' }}
      </button>
    </div>
  </Sheet>
</template>

<style scoped>
.nk__tid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ds-space-md); }
.nk__tid .ds-input { min-width: 0; }
.nk {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-lg);
}

.nk__felt {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  min-width: 0;
}

.nk__pills .ds-pill {
  min-height: 38px;
  padding: var(--ds-space-sm) var(--ds-space-md);
}

.nk__felt .ds-input { min-height: 48px; }

.nk__lagre {
  width: 100%;
  min-height: 48px;
}
</style>
