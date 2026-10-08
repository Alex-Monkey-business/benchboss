<script setup>
// «Vi er 21» — ett tall øverst på dagen, og hele økta regner seg ut.
//
// Tallet tastes, det blas ikke fram: fra 27 til 15 er tolv trykk på en pil,
// men to tastetrykk på talltastaturet. Pilene er for «én til kom».
//
// Tomt felt er et ærlig «ikke satt». Kullstørrelsen står som plassholder, så
// du ser hva du justerer fra.
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: null },
  kull: { type: Number, default: 0 }
})
const emit = defineEmits(['update:modelValue'])

const tekst = ref(props.modelValue ? String(props.modelValue) : '')
watch(() => props.modelValue, v => {
  // Ikke skriv over mens treneren taster — bare når tallet kommer utenfra
  // (en annen trener, eller pila).
  if (Number(tekst.value) !== v) tekst.value = v ? String(v) : ''
})

function inn(e) {
  const v = e.target.value.replace(/\D/g, '').slice(0, 2)
  tekst.value = v
  const n = Number(v)
  emit('update:modelValue', n > 0 ? n : null)
}

function steg(d) {
  const fra = props.modelValue || props.kull || 0
  const n = Math.max(1, Math.min(60, fra + d))
  emit('update:modelValue', n)
}

function ferdig(e) { e.target.blur() }
</script>

<template>
  <div class="antall" :class="{ 'antall--tom': !modelValue }">
    <label class="antall__merke" for="antall-input">
      <span class="antall__tittel">{{ modelValue ? 'På trening' : 'Hvor mange?' }}</span>
      <span class="antall__hjelp">{{ modelValue ? 'Delt med trenerne' : 'Styrer gruppene' }}</span>
    </label>
    <div class="antall__styr">
      <button type="button" class="antall__steg" aria-label="Én færre" @click="steg(-1)">−</button>
      <input
        id="antall-input"
        class="antall__tall"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        enterkeyhint="done"
        autocomplete="off"
        :value="tekst"
        :placeholder="kull ? String(kull) : '–'"
        aria-label="Antall på trening"
        @input="inn"
        @focus="$event.target.select()"
        @keydown.enter="ferdig"
      />
      <button type="button" class="antall__steg" aria-label="Én til" @click="steg(1)">+</button>
    </div>
  </div>
</template>

<style scoped>
.antall {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-sm) var(--ds-space-sm) var(--ds-space-sm) var(--ds-space-md);
  margin-bottom: var(--ds-space-lg);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-bg-elevated);
}
.antall--tom { border-style: dashed; }

.antall__merke { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.antall__tittel {
  white-space: nowrap;
  font-size: var(--ds-text-md);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
}
.antall__hjelp {
  white-space: nowrap;
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
}

.antall__styr {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
}
.antall__steg {
  width: 44px; height: 44px;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-primary);
  font-size: 1.25rem; line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform .1s ease;
}
.antall__steg:active { transform: scale(0.94); }

/* Tallet er det største på dagen: du leser det fra en meter unna. 16px+
   så iOS ikke zoomer inn når feltet får fokus. */
.antall__tall {
  width: 2.6ch;
  height: 48px;
  border: 0;
  background: transparent;
  text-align: center;
  font-size: 1.75rem;
  font-weight: var(--ds-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-text-primary);
  padding: 0;
}
.antall__tall::placeholder { color: var(--ds-color-text-tertiary); }
.antall__tall:focus { outline: none; box-shadow: inset 0 -2px 0 var(--ds-color-accent); }

@media (prefers-reduced-motion: reduce) {
  .antall__steg { transition: none; }
}
</style>
