<script setup>
const props = defineProps({
  label: { type: String, required: true },
  summary: { type: String, default: '' },
  emptyText: { type: String, default: 'Ikke valgt' },
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

function toggle() {
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <div :class="['disclosure', { 'disclosure--open': modelValue }]">
    <button
      type="button"
      class="disclosure__header"
      :aria-expanded="modelValue"
      @click="toggle"
    >
      <span class="disclosure__label">{{ label }}</span>
      <span
        :class="['disclosure__summary', { 'disclosure__summary--empty': !summary }]"
      >{{ summary || emptyText }}</span>
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
  border-bottom: 1px solid var(--ds-color-border-light);
}

.disclosure__header {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--ds-space-md);
  padding: var(--ds-space-md) 0;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
  min-height: 52px;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.disclosure__header:active {
  transform: scale(0.99);
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

.disclosure__chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ds-color-text-secondary);
  transition: transform 240ms cubic-bezier(0.32, 0.72, 0, 1);
}

.disclosure--open .disclosure__chevron {
  transform: rotate(180deg);
}

.disclosure__body {
  display: grid;
  grid-template-rows: 0fr;
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
  padding-bottom: var(--ds-space-lg);
}

@media (prefers-reduced-motion: reduce) {
  .disclosure__header,
  .disclosure__chevron,
  .disclosure__body {
    transition: none;
  }
}
</style>
