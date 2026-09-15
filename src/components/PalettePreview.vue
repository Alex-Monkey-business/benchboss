<script setup>
import { ref, watch } from 'vue'
import { useTheme } from '../composables/useTheme'
const { theme, setTheme } = useTheme()
const palette = ref(localStorage.getItem('bb-preview-palette') || 'whspr')
watch(palette, value => {
  document.documentElement.dataset.palette = value
  localStorage.setItem('bb-preview-palette', value)
}, { immediate: true })
</script>

<template>
  <details class="palette-preview">
    <summary>Prøv paletter</summary>
    <div class="palette-preview__controls">
      <label>Palett
        <select v-model="palette">
          <option value="whspr">Whspr / Cream</option>
          <option value="iris">Iris / Obsidian</option>
          <option value="forest">Skog / Rosa</option>
        </select>
      </label>
      <label>Utseende
        <select :value="theme" @change="setTheme($event.target.value)">
          <option value="system">Følg enheten</option>
          <option value="dark">Mørkt</option>
          <option value="light">Lyst</option>
        </select>
      </label>
    </div>
  </details>
</template>

<style scoped>
.palette-preview { align-self: center; width: min(320px, 100%); color: var(--ds-color-text-secondary); font-size: 12px; }
summary { cursor: pointer; width: fit-content; margin: auto; padding: 10px; }
.palette-preview__controls { display: flex; gap: 12px; padding: 12px; background: var(--ds-color-bg-subtle); border-radius: 10px; }
label { display: grid; gap: 6px; flex: 1; min-width: 0; }
select { width: 100%; min-height: 38px; font: inherit; color: var(--ds-color-text-primary); background: var(--ds-color-bg-elevated); border: 1px solid var(--ds-color-border); border-radius: 6px; }
</style>
