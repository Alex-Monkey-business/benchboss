<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { naarRolig } from '../lib/tilbake'
import { useRouter } from 'vue-router'
import Sheet from './Sheet.vue'
import Steg from './Steg.vue'
import { useMatches } from '../composables/useMatches'
import { usePlayers } from '../composables/usePlayers'
import { usePlayerSeasonTeams } from '../composables/usePlayerSeasonTeams'
import { sokKlubber } from '../composables/useKlubbmerke'
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
const { preferredTeam, activeCohort } = useAuth()
const router = useRouter()
const { settFravaer } = useMatches()
const { players, fetchPlayers } = usePlayers()
const { teamForSeason } = usePlayerSeasonTeams()
const { leggTilKamp } = useNyKamp()
const { show: showToast } = useToast()

const lagSlug = ref('')
const motstander = ref('')
const hjemme = ref(true)
const dato = ref('')
const tid = ref('')
const type = ref('treningskamp')
const lagrer = ref(false)

// Treningskamper: flere lag møter ofte samme klubb samme kveld. Da lages alle
// kampene her, én per lag i rekkefølge, hver med sitt klokkeslett.
const antall = ref(1)
const tider = ref([])
const blank = ref(false)
const erTrening = computed(() => type.value === 'treningskamp')
const kanFlere = computed(() => erTrening.value && seasonTeams.value.length > 1)
const flere = computed(() => kanFlere.value && antall.value > 1)
const kampene = computed(() => seasonTeams.value.slice(0, antall.value).map((t, i) => ({ lag: t, nr: i + 1 })))
watch([antall, tid], () => {
  // Nye rader arver tida fra raden over, så tre kamper kl. 18 er ett valg.
  const ny = tider.value.slice(0, antall.value)
  while (ny.length < antall.value) ny.push(ny[ny.length - 1] || tid.value || '')
  tider.value = ny
}, { immediate: true })
watch(kanFlere, v => { if (!v) antall.value = 1 })

// Forslag fra klubbsøket hos fotball.no mens du skriver. Det du skriver
// gjelder uansett: forslagene er en snarvei, ikke et krav.
const forslag = ref([])
const valgtForslag = ref('')
let sokTimer = null
let sokNr = 0
watch(motstander, v => {
  clearTimeout(sokTimer)
  const q = v.trim()
  if (q.length < 2 || q === valgtForslag.value) { forslag.value = []; return }
  const nr = ++sokNr
  sokTimer = setTimeout(async () => {
    const treff = await sokKlubber(q, activeCohort.value)
    if (nr === sokNr) forslag.value = treff.filter(t => kortKlubb(t.navn).toLowerCase() !== q.toLowerCase())
  }, 350)
})
// «Store Bergan Idrettslag» er klubben, «Store Bergan» er det dere sier.
// Korte ledd som FK og IL blir stående: «Tønsberg FK» er navnet.
const kortKlubb = navn => navn.replace(/\s+(turn og idrettsforening|idrettsforening|idrettslag|fotballklubb|ballklubb|sportsklubb)$/i, '').trim() || navn
function velgForslag(f) {
  const navn = kortKlubb(f.navn)
  valgtForslag.value = navn
  motstander.value = navn
  forslag.value = []
}

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
  antall.value = 1
  blank.value = false
  forslag.value = []
  valgtForslag.value = ''
})


const klar = computed(() => !!(props.seasonId && motstander.value.trim() && dato.value && !lagrer.value))

// Blank start: ingen fra laget er med. Treneren henter inn dem som skal spille.
async function tomTropp(kamp, slug) {
  await fetchPlayers()
  const ider = players.value.filter(p => teamForSeason(p, props.seasonId) === slug).map(p => p.id)
  return ider.length ? settFravaer(kamp.id, ider) : true
}

async function lagre() {
  if (!klar.value) return
  lagrer.value = true
  const skal = flere.value
    ? kampene.value.map((k, i) => ({ lag: k.lag, tid: tider.value[i] || '' }))
    : [{ lag: lag.value, tid: tid.value }]
  const laget = []
  for (const k of skal) {
    const kamp = await leggTilKamp({
      seasonId: props.seasonId,
      lag: k.lag,
      motstander: motstander.value,
      hjemme: hjemme.value,
      dato: dato.value,
      tid: k.tid,
      type: type.value
    })
    if (!kamp) break
    laget.push(kamp)
    if (erTrening.value && blank.value && k.lag) await tomTropp(kamp, k.lag.slug)
  }
  lagrer.value = false
  if (!laget.length) { showToast('Kunne ikke lagre kampen', 'error'); return }
  if (laget.length < skal.length) {
    showToast(`Bare ${laget.length} av ${skal.length} kamper ble lagret`, 'error')
    return
  }
  tom = true
  showToast(laget.length > 1 ? `${laget.length} kamper er lagt til` : 'Kampen er lagt til', 'success')
  emit('close')
  // Flere kamper: rett til banen for den første, med de andre ett trykk unna.
  // Arket må være ute av historikken først, ellers tar lukkingen navigeringen tilbake.
  if (laget.length > 1) {
    await nextTick()
    await naarRolig()
    router.push(`/kamp/${laget[0].id}/live`)
  }
}
</script>

<template>
  <Sheet :show="show" title="Ny kamp" @close="emit('close')">
    <div class="nk">
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

      <div v-if="kanFlere" class="nk__rad">
        <span class="ds-label nk__rad-navn">Antall kamper</span>
        <Steg :verdi="antall" :min="1" :maks="seasonTeams.length" navn="Antall kamper" @endre="antall = $event" />
      </div>

      <div v-if="seasonTeams.length > 1 && !flere" class="nk__felt">
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
        <ul v-if="forslag.length" class="nk__forslag" aria-label="Forslag til klubb">
          <li v-for="f in forslag" :key="f.fiksId">
            <button type="button" class="nk__forslag-rad" @click="velgForslag(f)">
              <span class="nk__forslag-navn">{{ f.navn }}</span>
              <span v-if="f.krets" class="nk__forslag-krets">{{ f.krets }}</span>
            </button>
          </li>
        </ul>
      </div>

      <div class="nk__felt">
        <span class="ds-label">Hvor</span>
        <div class="ds-pills nk__pills" role="group" aria-label="Hjemme eller borte">
          <button type="button" :class="['ds-pill', { 'ds-pill--active': hjemme }]" :aria-pressed="hjemme ? 'true' : 'false'" @click="hjemme = true">Hjemme</button>
          <button type="button" :class="['ds-pill', { 'ds-pill--active': !hjemme }]" :aria-pressed="!hjemme ? 'true' : 'false'" @click="hjemme = false">Borte</button>
        </div>
      </div>

      <div class="ds-form-row nk__tid" :class="{ 'nk__tid--en': flere }">
        <div class="nk__felt">
          <label class="ds-label" for="nk-dato">Dato</label>
          <input id="nk-dato" v-model="dato" type="date" lang="nb-NO" class="ds-input" />
        </div>
        <div v-if="!flere" class="nk__felt">
          <label class="ds-label ds-label--optional" for="nk-tid">Tid</label>
          <input id="nk-tid" v-model="tid" type="time" lang="nb-NO" class="ds-input" />
        </div>
      </div>

      <div v-if="flere" class="nk__kamper">
        <div v-for="(k, i) in kampene" :key="k.lag.slug" class="nk__rad nk__rad--kamp">
          <label class="nk__kamp-navn" :for="`nk-tid-${i}`">
            <span class="nk__kamp-nr">Kamp {{ k.nr }}</span>
            <span class="nk__kamp-lag">{{ k.lag.name }}</span>
          </label>
          <input :id="`nk-tid-${i}`" v-model="tider[i]" type="time" lang="nb-NO" class="ds-input nk__kamp-tid" :aria-label="`Klokkeslett, kamp ${k.nr}`" />
        </div>
      </div>

      <div v-if="erTrening" class="nk__felt">
        <span class="ds-label">{{ flere ? 'Lagene starter' : 'Laget starter' }}</span>
        <div class="ds-pills ds-pills--bred" role="group" aria-label="Hvordan laget starter">
          <button type="button" :class="['ds-pill', { 'ds-pill--active': !blank }]" :aria-pressed="!blank ? 'true' : 'false'" @click="blank = false">{{ flere ? 'Med lagene' : 'Med laget' }}</button>
          <button type="button" :class="['ds-pill', { 'ds-pill--active': blank }]" :aria-pressed="blank ? 'true' : 'false'" @click="blank = true">Blankt</button>
        </div>
      </div>

      <button type="button" class="ds-btn ds-btn--primary nk__lagre" :disabled="!klar" @click="lagre">
        {{ lagrer ? 'Lagrer …' : flere ? `Legg til ${antall} kamper` : 'Legg til kamp' }}
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

.nk__tid--en { grid-template-columns: 1fr; }
.nk__rad { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md); min-height: 56px; }
.nk__rad-navn { margin: 0; }
.nk__kamper { display: flex; flex-direction: column; }
.nk__rad--kamp + .nk__rad--kamp { border-top: var(--ds-border-width) solid var(--ds-color-border-light); }
.nk__rad--kamp { min-height: 68px; }
.nk__kamp-navn { display: flex; flex-direction: column; min-width: 0; }
.nk__kamp-nr { font-weight: var(--ds-weight-semibold); color: var(--ds-color-text-primary); }
.nk__kamp-lag { font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); }
.nk__kamp-tid { width: 132px; flex: none; min-height: 48px; }

.nk__forslag {
  list-style: none; margin: var(--ds-space-xs) 0 0; padding: 0 var(--ds-space-md);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-bg-elevated);
}
.nk__forslag li + li { border-top: var(--ds-border-width) solid var(--ds-color-border-light); }
.nk__forslag-rad {
  width: 100%; min-height: 52px; padding: 0;
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md);
  border: 0; background: none; font: inherit; text-align: left; cursor: pointer;
  color: var(--ds-color-text-primary); -webkit-tap-highlight-color: transparent;
}
.nk__forslag-navn { font-weight: var(--ds-weight-semibold); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nk__forslag-krets { flex: none; font-size: var(--ds-text-sm); color: var(--ds-color-text-tertiary); }

.nk__lagre {
  width: 100%;
  min-height: 48px;
}
</style>
