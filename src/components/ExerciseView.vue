<script setup>
// ÉN ØVELSE, ÉN VISNING.
//
// Banken og treningsdagen viste den samme øvelsen på to måter: banken som
// navngitte kort (Læringsmål, Gruppe, Gjennomføring, Se etter dette, Si dette
// til barna), dagen som en tekstdump med streker i margen — og uten de to
// siste kortene i det hele tatt. Det var akkurat feltinnholdet som manglet
// på feltet.
//
// Nå er dette rendringen, og begge flatene bruker den. Strukturen er lånt fra
// PocketCoach (ikke fargene og ikonene deres — rekkefølgen på informasjonen):
// først det du ser (videoen), så det som avgjør om øvelsen går i dag
// (nøkkeltallene), så hva de skal lære, hvordan du rigger, hva dere gjør, hva
// du ser etter og hva du roper. Ovenfra og ned er det rekkefølgen du trenger
// tingene i på banen.
//
// Tida er IKKE en egenskap ved øvelsen — samme rondo er 10 minutter tirsdag
// og 20 lørdag — så den kommer inn som prop fra dagen og står øverst blant
// nøkkeltallene når den finnes.
import { computed } from 'vue'
import { EXERCISE_CATEGORIES, equipmentLabel, plassLabel, spillereLabel, ovelsensVideo } from '../composables/useExercises'

const props = defineProps({
  // Bankrad eller drill fra økta (resolveDrills gir dem samme form; navnet
  // heter `name` i banken og `text` i drillen).
  exercise: { type: Object, required: true },
  minutes: { type: Number, default: 0 },
  // «Fra G2015» — tom for eget kull.
  opphav: { type: String, default: '' },
  // Hvor i treninga vi er: «Tirsdag · 2 av 3 · 0:20–0:40». Tom i banken.
  hvor: { type: String, default: '' }
})

const ex = computed(() => props.exercise || {})

const categoryLabel = computed(() =>
  EXERCISE_CATEGORIES.find(c => c.value === ex.value.category)?.label || ''
)

// MP4 fra tiim, eller en YouTube/Vimeo-lenke treneren limte inn — samme plass.
const video = computed(() => ovelsensVideo(ex.value))
const videoKilde = computed(() => video.value?.kilde || '')

function varighet(sek) {
  const s = Math.round(sek || 0)
  if (!s) return ''
  if (s < 60) return `${s} sek`
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Lenka står for seg bare når den ikke er videoens kilde — ellers viser vi
// samme adresse to ganger på samme skjerm.
const lenke = computed(() => {
  const l = ex.value.link
  if (!l || !l.url) return null
  if (video.value && video.value.source_url === l.url) return null
  return l
})

// Gjennomføringen er skrevet som linjer av en trener. Flere linjer er en
// rekkefølge, og da nummererer appen den. Én linje er ett avsnitt.
const gjennomforing = computed(() => {
  const linjer = String(ex.value.organisering || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  return { linjer, nummerert: linjer.length > 1 }
})

function formatMinutter(min) {
  if (!min) return ''
  const t = Math.floor(min / 60)
  const m = min % 60
  if (!t) return `${m} min`
  return m ? `${t} t ${m} min` : `${t} t`
}

// Bare radene som har en verdi. Et kort med tomme rader er verre enn ingen.
const nokkeltall = computed(() => {
  const a = ex.value
  const rader = []
  if (props.minutes) rader.push({ merke: 'Tid i dag', verdi: formatMinutter(props.minutes) })
  const spillere = spillereLabel(a.min_spillere, a.maks_spillere)
  if (spillere) rader.push({ merke: 'Spillere', verdi: spillere })
  if (a.min_alder) rader.push({ merke: 'Alder', verdi: `${a.min_alder} år+` })
  if (a.plass) rader.push({ merke: 'Plass', verdi: plassLabel(a.plass) })
  if ((a.utstyr_tags || []).length) rader.push({ merke: 'Utstyr', verdi: a.utstyr_tags.map(equipmentLabel).join(', ') })
  return rader
})

const momenter = computed(() => ex.value.laeringsmomenter || [])
const seEtter = computed(() => ex.value.se_etter || [])
const siTilBarna = computed(() => ex.value.si_til_barna || [])
const vanligeFeil = computed(() => ex.value.vanlige_feil || [])

// Har øvelsen noe å vise utover navnet? Uten dette står treneren på banen og
// ser på en tom sheet uten å skjønne om det er appen eller øvelsen som mangler.
const harInnhold = computed(() =>
  !!(video.value || ex.value.tema || nokkeltall.value.length || momenter.value.length || ex.value.gruppe ||
    gjennomforing.value.linjer.length || seEtter.value.length || siTilBarna.value.length || vanligeFeil.value.length || lenke.value)
)
</script>

<template>
  <div class="ex-view">
    <!-- Videoen først. Tjue sekunder film sier det oppsettet bruker fem
         linjer på — og på banen har du ikke fem linjer. Treneren står på
         mobilnett, så filmen lastes først når han trykker; uten poster
         hentes bare metadata, nok til at første bilde vises i stedet for
         en svart boks. -->
    <figure v-if="video" class="ex-video">
      <video
        v-if="video.kind === 'mp4'"
        class="ex-video__spiller"
        :src="video.url"
        :poster="video.poster || null"
        controls
        playsinline
        :preload="video.poster ? 'none' : 'metadata'"
      ></video>
      <!-- YouTube/Vimeo: spilleren deres i en ramme. nocookie-domenet holder
           sporingen unna til noen faktisk trykker play. -->
      <iframe
        v-else
        class="ex-video__spiller"
        :src="video.url"
        title="Video av øvelsen"
        loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
      <figcaption class="ex-video__tekst">
        <span>Video fra {{ videoKilde }}<template v-if="video.duration"> · {{ varighet(video.duration) }}</template></span>
        <a v-if="video.source_url" :href="video.source_url" target="_blank" rel="noopener">Åpne på {{ videoKilde }}</a>
      </figcaption>
    </figure>

    <!-- Én linje: hvor i treninga vi er, og hva slags øvelse. Tre korte
         rader under hverandre (eyebrow, merke, tema) ble tre avsnitt for tre
         ord — nå er det én rad og temaet. -->
    <div v-if="hvor || (ex.type && ex.type !== 'none') || categoryLabel || opphav" class="ex-view__head">
      <span v-if="hvor" class="ex-view__hvor">{{ hvor }}</span>
      <span v-if="ex.type && ex.type !== 'none'" class="ex-badge" :class="`ex-badge--${ex.type}`">{{ ex.type === 'diff' ? 'Diff' : 'Mix' }}</span>
      <span v-if="categoryLabel" class="ex-view__category">{{ categoryLabel }}</span>
      <span v-if="opphav" class="ex-view__opphav">Fra {{ opphav }}</span>
    </div>
    <p v-if="ex.tema" class="ex-view__tema">{{ ex.tema }}</p>

    <!-- Nøkkeltallene avgjør om øvelsen er aktuell i det hele tatt. Ni avbud
         en tirsdag, og «Spillere 4–9» er det du leser — ikke læringsmålet.
         Kortet har ingen overskrift: radene har sine egne merker. -->
    <section v-if="nokkeltall.length" class="ex-sek ex-sek--fakta">
      <dl class="ex-fakta">
        <template v-for="r in nokkeltall" :key="r.merke">
          <dt>{{ r.merke }}</dt>
          <dd>{{ r.verdi }}</dd>
        </template>
      </dl>
    </section>

    <!-- Seksjonene bærer sin egen ramme, så du skanner etter overskriften og
         finner delen du er ute etter. Rekkefølgen er lesningen: hva de skal
         lære, hvordan du rigger, hva dere gjør, hva du ser etter, hva du sier. -->
    <section v-if="momenter.length" class="ex-sek">
      <h4 class="ex-sek__tittel">Læringsmål</h4>
      <ul class="ex-punkter">
        <li v-for="(p, i) in momenter" :key="i">{{ p }}</li>
      </ul>
    </section>

    <section v-if="ex.gruppe" class="ex-sek">
      <h4 class="ex-sek__tittel">Gruppe</h4>
      <p class="ex-tekst">{{ ex.gruppe }}</p>
    </section>

    <section v-if="gjennomforing.linjer.length" class="ex-sek">
      <h4 class="ex-sek__tittel">Gjennomføring</h4>
      <ol v-if="gjennomforing.nummerert" class="ex-steg">
        <li v-for="(l, i) in gjennomforing.linjer" :key="i">{{ l }}</li>
      </ol>
      <p v-else class="ex-tekst">{{ gjennomforing.linjer[0] }}</p>
    </section>

    <!-- Tegnene på at øvelsen virker. Læringsmålet er hva de skal få til;
         dette er hva du ser etter mens de prøver. -->
    <section v-if="seEtter.length" class="ex-sek">
      <h4 class="ex-sek__tittel">Se etter dette</h4>
      <ul class="ex-punkter">
        <li v-for="(p, i) in seEtter" :key="i">{{ p }}</li>
      </ul>
    </section>

    <!-- Ordene du roper. Som sitat, fordi de skal leses som noe du sier høyt. -->
    <section v-if="siTilBarna.length" class="ex-sek">
      <h4 class="ex-sek__tittel">Si dette til barna</h4>
      <ul class="ex-fraser">
        <li v-for="(p, i) in siTilBarna" :key="i">«{{ p }}»</li>
      </ul>
    </section>

    <!-- Det som går galt. se_etter er tegnene på at det virker; dette er det
         du griper inn på. Sist, fordi du leser det når noe skurrer. -->
    <section v-if="vanligeFeil.length" class="ex-sek">
      <h4 class="ex-sek__tittel">Vanlige feil</h4>
      <ul class="ex-punkter">
        <li v-for="(p, i) in vanligeFeil" :key="i">{{ p }}</li>
      </ul>
    </section>

    <a v-if="lenke" :href="lenke.url" target="_blank" rel="noopener" class="ex-lenke">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      {{ lenke.label || lenke.url }}
    </a>

    <!-- Ærlig tom: det er øvelsen som mangler innhold, ikke appen. -->
    <p v-if="!harInnhold" class="ex-tom">Ingenting skrevet om denne øvelsen ennå.</p>

    <slot />
  </div>
</template>

<style scoped>
.ex-view {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-lg);
}

.ex-view__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ds-space-sm);
}

.ex-badge {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.ex-badge--diff { background: var(--accent-bg, var(--ds-badge-bg)); color: var(--accent-text, var(--ds-badge-text)); }
.ex-badge--mix { background: transparent; color: var(--accent-text, var(--ds-badge-text)); box-shadow: inset 0 0 0 1px currentColor; }

.ex-view__category {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  padding: 2px 8px;
}

/* Avsenderen, ikke en grense: øvelsen er klubbens og kan brukes av alle. */
.ex-view__opphav {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
  background: var(--ds-color-bg-subtle);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  padding: 2px 8px;
}

.ex-view__tema {
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-warm-text);
  margin: 0;
}

.ex-view__head + .ex-view__tema { margin-top: calc(-1 * var(--ds-space-sm)); }

/* ---- Video ---- */
.ex-video { margin: 0; }

/* I sheeten går videoen kant til kant, rett under tittelen — en hero, ikke et
   bilde i en tekst. Sheet-kroppen har lg-padding rundt seg; vi trekker
   figuren ut i den. */
.ex-view--sheet .ex-video {
  margin: calc(-1 * var(--ds-space-lg)) calc(-1 * var(--ds-space-lg)) 0;
}

.ex-view--sheet .ex-video__spiller { border-radius: 0; }
.ex-view--sheet .ex-video__tekst { padding: 0 var(--ds-space-lg); }

.ex-view__hvor {
  margin: 0 auto 0 0;
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-tertiary);
}


/* 16:9 låst før filmen er lastet, så siden ikke hopper når posteren kommer.
   Mørk flate bak: filmene er filmet ute, og en hvit boks rundt en grønn bane
   ser ut som en feil. */
.ex-video__spiller {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 0;
  border-radius: var(--ds-radius-md);
  background: #0E0E0D;
  object-fit: cover;
}

.ex-video__tekst {
  display: flex;
  justify-content: space-between;
  gap: var(--ds-space-md);
  margin-top: 6px;
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-tertiary);
}

.ex-video__tekst a {
  flex: none;
  color: var(--ds-color-text-secondary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ---- Seksjonene ---- */
.ex-sek {
  background: var(--ds-color-bg-subtle);
  border: var(--ds-border-width, 1px) solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  padding: var(--ds-space-md);
}

.ex-sek__tittel {
  margin: 0 0 var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  letter-spacing: -0.01em;
}

/* Verdien til høyre, merket til venstre, hårstrek mellom radene: en tabell
   med to kolonner, og øyet finner «Spillere» uten å lese resten. */
.ex-sek--fakta { padding: var(--ds-space-sm) var(--ds-space-md); }

.ex-fakta {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: baseline;
  gap: 0 var(--ds-space-md);
}

.ex-fakta dt {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  padding: var(--ds-space-sm) 0;
}

.ex-fakta dd {
  margin: 0;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-primary);
  text-align: right;
  font-variant-numeric: tabular-nums;
  padding: var(--ds-space-sm) 0;
}

.ex-fakta dt:not(:first-of-type),
.ex-fakta dd:not(:first-of-type) { border-top: 1px solid var(--ds-color-border); }

/* Reset-en nuller list-style, så padding alene gir ingen markør: et moment
   over to linjer rant rett inn i det neste. Streken i margen er markøren. */
.ex-punkter {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.ex-punkter li {
  position: relative;
  padding-left: var(--ds-space-md);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.55;
}

.ex-punkter li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.7em;
  width: 8px;
  height: 1px;
  background: var(--ds-color-text-tertiary);
}

/* Tallet står i margen, ikke i tekstblokka. */
.ex-steg {
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: steg;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.ex-steg li {
  counter-increment: steg;
  position: relative;
  padding-left: 1.9em;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.55;
}

.ex-steg li::before {
  content: counter(steg) ".";
  position: absolute;
  left: 0;
  top: 0;
  width: 1.4em;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-tertiary);
}

/* Frasene er replikker, ikke punkter. Anførselstegnene er markøren. */
.ex-fraser {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
}

.ex-fraser li {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.55;
}

/* Avsnittene er skrevet av en trener med tomme linjer — de skal stå. */
.ex-tekst {
  white-space: pre-line;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.55;
  margin: 0;
}

.ex-lenke {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  font-size: var(--ds-text-sm);
  font-weight: 500;
  color: var(--ds-color-text-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.ex-lenke svg { width: 15px; height: 15px; flex-shrink: 0; }

.ex-tom {
  margin: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
}
</style>
