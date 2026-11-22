<script setup>
// Øvelsen bak ett trykk — samme ark fra uka, dagen og økta. Samme visning som
// banken (ExerciseView), med Forrige/Neste nederst så du blar deg gjennom
// treninga uten å gå tilbake til lista mellom hver øvelse.
import { computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ovelsensVideo } from '../composables/useExercises'
import { naarRolig } from '../lib/tilbake'
import Sheet from './Sheet.vue'
import ExerciseView from './ExerciseView.vue'
import ExerciseVideo from './ExerciseVideo.vue'

const props = defineProps({
  liste: { type: Array, default: () => [] },
  // Indeksen i lista som er åpen, eller null.
  i: { type: Number, default: null },
  // Tekst over øvelsen, f.eks. «Tirsdag · 2 av 5».
  hvor: { type: String, default: '' }
})
const emit = defineEmits(['update:i'])
const router = useRouter()

const drill = computed(() => (props.i == null ? null : props.liste[props.i] || null))
const video = computed(() => (drill.value ? ovelsensVideo(drill.value) : null))
const forrige = computed(() => (props.i == null ? null : props.liste[props.i - 1] || null))
const neste = computed(() => (props.i == null ? null : props.liste[props.i + 1] || null))

async function bla(d) {
  const j = props.i + d
  if (j < 0 || j >= props.liste.length) return
  emit('update:i', j)
  // Ny øvelse, start på toppen — ellers lander du midt i «Si dette til barna»
  // på den neste fordi du sto der på den forrige.
  await nextTick()
  document.querySelectorAll('.ds-sheet__body').forEach(el => el.scrollTo({ top: 0 }))
}

async function tilBanken(id) {
  emit('update:i', null)
  await nextTick()
  await naarRolig()
  router.push({ path: '/trening/ovelser', query: { ovelse: id } })
}
</script>

<template>
  <Sheet :show="!!drill" :title="drill?.text || ''" @close="emit('update:i', null)">
    <template v-if="video" #media>
      <ExerciseVideo :video="video" />
    </template>
    <template v-if="drill">
      <ExerciseView
        class="ex-view--sheet"
        :exercise="drill"
        :minutes="drill.minutes || 0"
        :video-ute="!!video"
        :hvor="hvor"
      >
        <nav v-if="liste.length > 1" class="ovelse-sheet__bla" aria-label="Bla i treninga">
          <button type="button" class="bla" :disabled="!forrige" @click="bla(-1)">
            <span class="bla__merke">Forrige</span>
            <span class="bla__navn">{{ forrige?.text || '—' }}</span>
          </button>
          <button type="button" class="bla bla--neste" :disabled="!neste" @click="bla(1)">
            <span class="bla__merke">Neste</span>
            <span class="bla__navn">{{ neste?.text || '—' }}</span>
          </button>
        </nav>
        <a
          v-if="drill.exercise_id"
          :href="`/trening/ovelser?ovelse=${drill.exercise_id}`"
          class="ovelse-sheet__bank"
          @click.prevent="tilBanken(drill.exercise_id)"
        >Endre øvelsen i banken</a>
      </ExerciseView>
    </template>
  </Sheet>
</template>

<style scoped>
/* To store flater, ikke to piler: på banen treffer du med tommelen uten å se.
   Navnet på neste øvelse står på knappen, så du vet hva du blar til. */
.ovelse-sheet__bla {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
}
.bla {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2xs);
  min-width: 0;
  min-height: 60px;
  padding: var(--ds-space-12) var(--ds-space-md);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated);
  font-family: var(--ds-font-body);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.bla--neste { text-align: right; align-items: flex-end; }
.bla:disabled { opacity: 0.4; cursor: default; }
.bla:not(:disabled):active { transform: scale(0.98); }
.bla__merke {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}
.bla__navn {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}
.ovelse-sheet__bank {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin-top: var(--ds-space-xs);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
