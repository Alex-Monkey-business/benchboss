<script setup>
defineProps({
  toasts: { type: Array, default: () => [] }
})
</script>

<template>
  <div class="ds-toast-container" style="bottom: 88px;">
    <TransitionGroup name="ds-toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['ds-toast', `ds-toast--${toast.type}`]"
      >
        <svg v-if="toast.type === 'success'" class="ds-toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <svg v-else-if="toast.type === 'error'" class="ds-toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        {{ toast.message }}
      </div>
    </TransitionGroup>
  </div>
</template>
