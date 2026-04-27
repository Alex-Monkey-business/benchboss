<script setup>
defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: 'Bekreft' },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Bekreft' },
  cancelLabel: { type: String, default: 'Avbryt' },
  variant: { type: String, default: 'warning' }
})

const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <Transition name="ds-dialog">
    <div v-if="show" class="ds-overlay" @click.self="emit('cancel')">
      <div class="ds-dialog ds-dialog--narrow">
        <div class="confirm-icon" :class="`confirm-icon--${variant}`">
          <svg v-if="variant === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3 class="ds-dialog__title ds-text-center">{{ title }}</h3>
        <div class="ds-dialog__body ds-text-center" style="margin-top: 8px;">
          <p>{{ message }}</p>
        </div>
        <div class="ds-dialog__footer" style="justify-content: center;">
          <button class="ds-btn ds-btn--secondary" @click="emit('cancel')">{{ cancelLabel }}</button>
          <button class="ds-btn ds-btn--primary" @click="emit('confirm')">{{ confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
