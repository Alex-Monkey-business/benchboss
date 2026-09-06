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
        <!-- Kudos: tommel opp i en ring. Alex ba om tommelen. -->
        <span v-else-if="toast.type === 'kudos'" class="ds-toast__ring">
          <svg class="ds-toast__thumb" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 11v9"/><path d="M3 11h4l3.5-7.5a2 2 0 0 1 3.8 1.2L13.5 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/>
          </svg>
        </span>
        <span class="ds-toast__text">
          <span class="ds-toast__msg">{{ toast.message }}</span>
          <span v-if="toast.detail" class="ds-toast__detail">{{ toast.detail }}</span>
        </span>
        <button v-if="toast.action" type="button" class="ds-toast__action" @click="toast.action.run()">{{ toast.action.label }}</button>
      </div>
    </TransitionGroup>
  </div>
</template>
