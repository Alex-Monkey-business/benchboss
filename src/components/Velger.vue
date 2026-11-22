<script setup>
import Ikon from './Ikon.vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

// Et felt med en kort meny rett under, i stedet for telefonens egen
// valgliste. Den tok hele skjermen for åtte posisjoner, med gruppeoverskrifter
// og radioknapper som ikke ligner resten av appen.
//
// Menyen teleporteres til body og står fast over arket, så den ikke klippes
// av arkets scroll. Åpner oppover når det ikke er plass under.
const props = defineProps({
  modelValue: { type: String, default: '' },
  // [{ value, label, disabled? }]
  valg: { type: Array, required: true },
  tom: { type: String, default: 'Ingen' },
  disabled: { type: Boolean, default: false },
  id: { type: String, default: undefined }
})
const emit = defineEmits(['update:modelValue'])

const apen = ref(false)
const felt = ref(null)
const meny = ref(null)
const pos = ref({})
const aktiv = ref(-1)

// «Ingen» først, så valget kan tas bort.
const rader = computed(() => [{ value: '', label: props.tom }, ...props.valg])
const valgt = computed(() => props.valg.find(v => v.value === props.modelValue) || null)

// Hele lista uten scroll når den får plass: ni posisjoner er 404 px.
const RAD = 44
function plasser() {
  const r = felt.value?.getBoundingClientRect()
  if (!r) return
  const hoyde = rader.value.length * RAD + 10
  const under = window.innerHeight - r.bottom - 16
  const over = r.top - 16
  const opp = under < hoyde && over > under
  pos.value = {
    left: `${r.left}px`,
    width: `${r.width}px`,
    maxHeight: `${Math.min(hoyde, opp ? over : under)}px`,
    ...(opp ? { bottom: `${window.innerHeight - r.top + 6}px` } : { top: `${r.bottom + 6}px` })
  }
}

async function apne() {
  if (props.disabled) return
  plasser()
  aktiv.value = Math.max(0, rader.value.findIndex(v => v.value === props.modelValue))
  apen.value = true
  await nextTick()
  meny.value?.querySelectorAll('[role="option"]')[aktiv.value]?.scrollIntoView({ block: 'nearest' })
}
function lukk(fokus = true) {
  apen.value = false
  if (fokus) felt.value?.focus()
}
function velg(v) {
  if (v.disabled) return
  emit('update:modelValue', v.value)
  lukk()
}

function tast(e) {
  if (!apen.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); apne() }
    return
  }
  const n = rader.value.length
  const flytt = d => {
    let i = aktiv.value
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!rader.value[i].disabled) break }
    aktiv.value = i
    meny.value?.querySelectorAll('[role="option"]')[i]?.scrollIntoView({ block: 'nearest' })
  }
  if (e.key === 'ArrowDown') { e.preventDefault(); flytt(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); flytt(-1) }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); velg(rader.value[aktiv.value]) }
  else if (e.key === 'Escape') {
    // Bare menyen lukkes, ikke arket den står i (det lytter på document).
    e.stopPropagation()
    lukk()
  }
  else if (e.key === 'Tab') lukk(false)
}

// Trykk utenfor lukker. Scroll i arket bak lukker også: menyen står fast og
// ville ellers sklidd fra feltet sitt.
function utenfor(e) {
  if (felt.value?.contains(e.target) || meny.value?.contains(e.target)) return
  lukk(false)
}
function scroll(e) {
  if (meny.value?.contains(e.target)) return
  lukk(false)
}
watch(apen, a => {
  const f = a ? 'addEventListener' : 'removeEventListener'
  document[f]('pointerdown', utenfor, true)
  window[f]('scroll', scroll, true)
  window[f]('resize', plasser)
})
onBeforeUnmount(() => { if (apen.value) apen.value = false })
</script>

<template>
  <button
    :id="id"
    ref="felt"
    type="button"
    class="velger"
    :class="{ 'velger--apen': apen, 'velger--tom': !valgt }"
    :disabled="disabled"
    aria-haspopup="listbox"
    :aria-expanded="apen ? 'true' : 'false'"
    @click="apen ? lukk() : apne()"
    @keydown="tast"
  >
    <span class="velger__verdi">{{ valgt ? valgt.label : tom }}</span>
    <Ikon navn="pil-ned" class="velger__pil" aria-hidden="true" />
  </button>

  <Teleport to="body">
    <Transition name="velger-meny">
      <ul v-if="apen" ref="meny" class="velger-meny" role="listbox" :style="pos" @keydown="tast">
        <li
          v-for="(v, i) in rader"
          :key="v.value || 'tom'"
          role="option"
          class="velger-meny__rad"
          :class="{
            'velger-meny__rad--valgt': v.value === modelValue,
            'velger-meny__rad--aktiv': i === aktiv,
            'velger-meny__rad--av': v.disabled,
            'velger-meny__rad--tom': !v.value
          }"
          :aria-selected="v.value === modelValue ? 'true' : 'false'"
          :aria-disabled="v.disabled ? 'true' : undefined"
          @pointerenter="aktiv = i"
          @click="velg(v)"
        >
          <span>{{ v.label }}</span>
          <Ikon navn="hake" vekt="bold" v-if="v.value === modelValue" class="velger-meny__hake" aria-hidden="true" />
        </li>
      </ul>
    </Transition>
  </Teleport>
</template>

<style scoped>
.velger {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-sm);
  width: 100%; min-height: 48px; padding: 0 var(--ds-space-md);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated);
  font: inherit; font-size: var(--ds-text-base); color: var(--ds-color-text-primary);
  text-align: left; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color var(--ds-duration-fast) var(--ds-ease-out), box-shadow var(--ds-duration-fast) var(--ds-ease-out);
}
.velger:focus-visible, .velger--apen { outline: none; border-color: var(--ds-color-accent); box-shadow: var(--ds-shadow-focus); }
.velger:disabled { cursor: default; opacity: .5; }
.velger--tom .velger__verdi { color: var(--ds-color-text-tertiary); }
.velger__verdi { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.velger__pil { flex: none; width: 18px; height: 18px; color: var(--ds-color-text-tertiary); transition: transform var(--ds-duration-fast) var(--ds-ease-out); }
.velger--apen .velger__pil { transform: rotate(180deg); }

.velger-meny {
  position: fixed; z-index: calc(var(--ds-z-modal, 1000) + 10);
  margin: 0; padding: var(--ds-space-xs); list-style: none; overflow-y: auto; overscroll-behavior: contain;
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border-light);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-lg);
}
.velger-meny__rad {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-sm);
  min-height: 44px; padding: 0 var(--ds-space-md);
  border-radius: var(--ds-radius-md);
  font-size: var(--ds-text-base); color: var(--ds-color-text-primary);
  cursor: pointer; user-select: none;
}
.velger-meny__rad--aktiv { background: var(--ds-color-bg-subtle); }
.velger-meny__rad--valgt { font-weight: var(--ds-weight-semibold); }
.velger-meny__rad--tom { color: var(--ds-color-text-tertiary); }
.velger-meny__rad--av { color: var(--ds-color-text-tertiary); opacity: .45; cursor: default; }
.velger-meny__rad--av.velger-meny__rad--aktiv { background: transparent; }
.velger-meny__hake { flex: none; width: 18px; height: 18px; color: var(--ds-color-accent); }

.velger-meny-enter-active, .velger-meny-leave-active { transition: opacity .12s ease, transform .12s ease; }
.velger-meny-enter-from, .velger-meny-leave-to { opacity: 0; transform: translateY(-4px); }
@media (prefers-reduced-motion: reduce) {
  .velger-meny-enter-active, .velger-meny-leave-active { transition: none; }
}
</style>
