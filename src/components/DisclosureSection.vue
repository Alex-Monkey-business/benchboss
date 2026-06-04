<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  summary: { type: String, default: '' },
  emptyText: { type: String, default: 'Ikke valgt' },
  modelValue: { type: Boolean, default: false },
  // Når et #summary-slot brukes: styrer om slot-innholdet (chips) vises, ellers
  // faller vi tilbake til empty-text. Tekst-bare bruk er upåvirket.
  hasContent: { type: Boolean, default: true }
})

const emit = defineEmits(['update:modelValue'])

// Aktiver transitions først etter første render — ellers vil komponenter som
// mountes med modelValue=true animere fra collapsed→open (flash).
const mounted = ref(false)
onMounted(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      mounted.value = true
    })
  })
})

function toggle() {
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <div :class="['disclosure', { 'disclosure--open': modelValue, 'disclosure--mounted': mounted }]">
    <button
      type="button"
      class="disclosure__header"
      :aria-expanded="modelValue"
      @click="toggle"
    >
      <span class="disclosure__label">{{ label }}</span>
      <!-- Sammendrag vises kun når seksjonen er lukket — åpen = du redigerer
           innholdet rett under, så headeren skal ikke gjenta det. -->
      <span
        v-if="!modelValue && $slots.summary && hasContent"
        class="disclosure__summary disclosure__summary--rich"
      ><slot name="summary" /></span>
      <span
        v-else-if="!modelValue"
        :class="['disclosure__summary', { 'disclosure__summary--empty': !summary }]"
      >{{ summary || emptyText }}</span>
      <span v-else></span>
      <span class="disclosure__chevron" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </span>
    </button>
    <div class="disclosure__body">
      <div class="disclosure__inner">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.disclosure {
  background: var(--ds-color-bg-elevated);
  border: 1px solid var(--ds-color-border-light);
  border-radius: 14px;
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.disclosure--open {
  border-color: var(--ds-color-border);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03), 0 4px 12px rgba(0, 0, 0, 0.04);
}

.disclosure__header {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--ds-space-md);
  padding: 14px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
  min-height: 56px;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.disclosure__header:active {
  transform: scale(0.99);
}

@media (hover: hover) and (pointer: fine) {
  .disclosure__header:hover {
    background: rgba(0, 0, 0, 0.02);
  }
}

.disclosure__label {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--ds-color-text-secondary);
  text-transform: uppercase;
}

.disclosure__summary {
  font-size: 14px;
  font-weight: 500;
  color: var(--ds-color-text);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.disclosure__summary--empty {
  color: var(--ds-color-text-muted, var(--ds-color-text-secondary));
  font-weight: 400;
  font-style: normal;
  opacity: 0.7;
}

/* Rik summary: høyrejustert chip-rad i headeren (lese-modus). Innholdet er
   antalls-begrenset av kalleren, så overflow:hidden er bare et sikkerhetsnett. */
.disclosure__summary--rich {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  overflow: hidden;
  white-space: normal;
}

.disclosure__chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ds-color-text-secondary);
}

.disclosure--mounted .disclosure__chevron {
  transition: transform 240ms cubic-bezier(0.32, 0.72, 0, 1);
}

.disclosure--open .disclosure__chevron {
  transform: rotate(180deg);
}

.disclosure__body {
  display: grid;
  grid-template-rows: 0fr;
}

.disclosure--mounted .disclosure__body {
  transition: grid-template-rows 240ms cubic-bezier(0.32, 0.72, 0, 1);
}

.disclosure--open .disclosure__body {
  grid-template-rows: 1fr;
}

.disclosure__inner {
  min-height: 0;
  overflow: hidden;
}

.disclosure--open .disclosure__inner {
  padding: 4px 16px var(--ds-space-lg);
}

@media (prefers-reduced-motion: reduce) {
  .disclosure__header,
  .disclosure__chevron,
  .disclosure__body {
    transition: none;
  }
}
</style>
