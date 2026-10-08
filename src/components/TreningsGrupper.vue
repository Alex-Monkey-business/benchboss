<script setup>
// Gruppene på én øvelse, ferdig fordelt — og rettet på banen.
//
// Appen vet ikke hvem som kommer. Den deler hele kullet, og treneren trykker
// bort dem som ikke er der. Det er oppmøte bare der det trengs: fire avbud er
// fire trykk på første øvelse, og resten av treninga er riktig.
//
// Ett trykk på et navn velger det. Trykk et annet navn, så bytter de plass.
// Eller «Ikke her». Dra-og-slipp på en telefon med kalde fingre er ikke et
// alternativ.
//
// Gruppene heter «Gruppe 1, 2, 3», aldri A/B/C. Telefonen vises frem på
// banen, og nivået er trenernes, ikke barnas.
import { computed, ref, watch } from 'vue'
import { lagGrupper, antallGrupper, medBytter, kortnavn } from '../lib/grupper'
import { useTreningsGrupper } from '../composables/useTreningsGrupper'

const props = defineProps({
  sessionId: { type: String, required: true },
  // Hvilken øvelse i dagen — plassering + opphav, så to like øvelser på
  // samme dag får hvert sitt notat.
  nokkel: { type: String, required: true },
  type: { type: String, default: 'diff' },
  perGruppe: { type: Number, default: null },
  spillere: { type: Array, default: () => [] },
  levelFor: { type: Function, required: true }
})

const g = useTreningsGrupper()

const fravar = computed(() => g.fravar(props.sessionId))
const notat = computed(() => g.ovelse(props.sessionId, props.nokkel))
const navn = computed(() => kortnavn(props.spillere))

const tilStede = computed(() => props.spillere.filter(s => !fravar.value.includes(s.id)))
const borte = computed(() => props.spillere.filter(s => fravar.value.includes(s.id)))

// Uten størrelse på øvelsen: tre på diff (det nivåene ga før), to på mix.
const foreslatt = computed(() =>
  props.perGruppe
    ? antallGrupper(tilStede.value.length, props.perGruppe)
    : Math.min(tilStede.value.length, props.type === 'mix' ? 2 : 3)
)
const antall = computed(() => Math.min(notat.value.antall || foreslatt.value, tilStede.value.length))

// Frøet blandes med øvelsen, ellers får hver øvelse samme par.
function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h >>> 0
}

const grupper = computed(() => {
  const liste = tilStede.value.map(s => ({ id: s.id, niva: props.levelFor(s.id) }))
  const fordelt = lagGrupper(liste, antall.value, props.type, hash(props.nokkel) + notat.value.seed)
  return medBytter(fordelt, notat.value.bytter)
})

const storrelse = computed(() => {
  const s = grupper.value.map(x => x.length)
  if (!s.length) return ''
  const min = Math.min(...s), maks = Math.max(...s)
  return min === maks ? `${min} i hver` : `${min}–${maks} i hver`
})

const manglerNiva = computed(() => props.spillere.some(s => !props.levelFor(s.id)))

const valgt = ref(null)
watch(() => props.nokkel, () => { valgt.value = null })

function trykk(id) {
  if (!valgt.value) { valgt.value = id; return }
  if (valgt.value === id) { valgt.value = null; return }
  g.bytt(props.sessionId, props.nokkel, valgt.value, id)
  valgt.value = null
}

function ikkeHer() {
  if (!valgt.value) return
  g.settBorte(props.sessionId, valgt.value)
  valgt.value = null
}

function endreAntall(d) {
  const n = antall.value + d
  if (n < 1 || n > tilStede.value.length) return
  g.settAntall(props.sessionId, props.nokkel, n === foreslatt.value ? null : n)
  valgt.value = null
}

function bland() {
  g.bland(props.sessionId, props.nokkel)
  valgt.value = null
}
</script>

<template>
  <section class="ex-sek grp">
    <div class="grp__hode">
      <h4 class="ex-sek__tittel grp__tittel">Grupper</h4>
      <div class="grp__antall" role="group" aria-label="Antall grupper">
        <button type="button" class="grp__steg" :disabled="antall <= 1" aria-label="Færre grupper" @click="endreAntall(-1)">−</button>
        <span class="grp__n">{{ antall }}</span>
        <button type="button" class="grp__steg" :disabled="antall >= tilStede.length" aria-label="Flere grupper" @click="endreAntall(1)">+</button>
      </div>
    </div>
    <p class="grp__meta">
      {{ tilStede.length }} på trening · {{ storrelse }} · {{ type === 'mix' ? 'nivåene blandet' : 'likt nivå' }}
    </p>

    <ol class="grp__liste">
      <li v-for="(gr, i) in grupper" :key="i" class="grp__gruppe">
        <span class="grp__merke">Gruppe {{ i + 1 }}</span>
        <div class="grp__navn">
          <button
            v-for="id in gr"
            :key="id"
            type="button"
            class="grp__spiller"
            :class="{ 'grp__spiller--valgt': valgt === id, 'grp__spiller--mal': valgt && valgt !== id }"
            :aria-pressed="valgt === id ? 'true' : 'false'"
            @click="trykk(id)"
          >{{ navn[id] }}</button>
        </div>
      </li>
    </ol>

    <div v-if="valgt" class="grp__valg" role="status">
      <span>Trykk et annet navn for å bytte</span>
      <button type="button" class="grp__knapp" @click="ikkeHer">{{ navn[valgt] }} er ikke her</button>
    </div>

    <div v-if="borte.length" class="grp__borte">
      <span class="grp__merke">Ikke her</span>
      <div class="grp__navn">
        <button
          v-for="s in borte"
          :key="s.id"
          type="button"
          class="grp__spiller grp__spiller--borte"
          :aria-label="`${navn[s.id]} er her likevel`"
          @click="g.settTilStede(sessionId, s.id)"
        >{{ navn[s.id] }}</button>
      </div>
    </div>

    <div class="grp__fot">
      <button type="button" class="grp__lenke" @click="bland">Bland på nytt</button>
      <router-link v-if="manglerNiva" to="/admin/niva" class="grp__lenke">Sett nivå</router-link>
    </div>
  </section>
</template>

<style scoped>
.grp__hode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
}
.grp__tittel { margin: 0; }

.grp__antall {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
}
.grp__steg {
  width: 40px; height: 36px;
  border: 0; background: none; cursor: pointer;
  font-size: 1.125rem; line-height: 1;
  color: var(--ds-color-text-primary);
  -webkit-tap-highlight-color: transparent;
}
.grp__steg:disabled { color: var(--ds-color-text-tertiary); cursor: default; }
.grp__n {
  min-width: 1.5em;
  text-align: center;
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.grp__meta {
  margin: var(--ds-space-xs) 0 0;
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.grp__liste {
  list-style: none;
  margin: var(--ds-space-md) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.grp__gruppe { padding: var(--ds-space-sm) 0; }
.grp__gruppe + .grp__gruppe { border-top: 1px solid var(--ds-color-border); }

.grp__merke {
  display: block;
  margin-bottom: 6px;
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
}

.grp__navn { display: flex; flex-wrap: wrap; gap: 6px; }

/* Navnene er knapper, men skal leses som navn: rolig flate, full kontrast. */
.grp__spiller {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  font-size: var(--ds-text-sm);
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease, transform .1s ease;
  -webkit-tap-highlight-color: transparent;
}
.grp__spiller:active { transform: scale(0.96); }
.grp__spiller--valgt {
  background: var(--ds-color-accent);
  border-color: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}
/* Med ett navn valgt er alle de andre mål for et bytte. */
.grp__spiller--mal { border-style: dashed; }
.grp__spiller--borte {
  color: var(--ds-color-text-tertiary);
  text-decoration: line-through;
  background: transparent;
}

.grp__valg {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
  padding: var(--ds-space-sm) 0 0;
  border-top: 1px solid var(--ds-color-border);
  background: var(--ds-color-bg-subtle);
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
}
.grp__knapp {
  flex: none;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  cursor: pointer;
}

.grp__borte {
  margin-top: var(--ds-space-sm);
  padding-top: var(--ds-space-sm);
  border-top: 1px solid var(--ds-color-border);
}

.grp__fot {
  display: flex;
  justify-content: space-between;
  margin-top: var(--ds-space-md);
}
.grp__lenke {
  border: 0; background: none; padding: 0; cursor: pointer;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-accent);
  text-decoration: none;
}

@media (prefers-reduced-motion: reduce) {
  .grp__spiller { transition: none; }
}
</style>
