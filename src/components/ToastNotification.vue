<script setup>
import Ikon from './Ikon.vue'
defineProps({
  toasts: { type: Array, default: () => [] }
})
</script>

<template>
  <div class="ds-toast-container">
    <TransitionGroup name="ds-toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['ds-toast', `ds-toast--${toast.type}`]"
      >
        <Ikon navn="hake" v-if="toast.type === 'success'" class="ds-toast__icon" />
        <Ikon navn="feil" v-else-if="toast.type === 'error'" class="ds-toast__icon" />
        <!-- Kudos: tommel opp i en ring. Alex ba om tommelen. -->
        <span v-else-if="toast.type === 'kudos'" class="ds-toast__ring">
          <Ikon navn="tommel" class="ds-toast__thumb" />
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
