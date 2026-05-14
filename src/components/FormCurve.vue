<script setup>
// Renders last N match results as colored chips (oldest left → newest right).
// `results` items: { result: 'w'|'d'|'l', opponent, score, date }
defineProps({
  results: { type: Array, required: true },
  max: { type: Number, default: 8 },
  label: { type: String, default: 'Form' }
})

const RESULT_LABEL = { w: 'V', d: 'U', l: 'T' }
</script>

<template>
  <div v-if="results.length > 0" class="form-curve">
    <span class="form-curve__label">{{ label }}</span>
    <ol class="form-curve__chips">
      <li
        v-for="(r, i) in results.slice(-max)"
        :key="i"
        :class="['form-curve__chip', `form-curve__chip--${r.result}`]"
        :title="`${RESULT_LABEL[r.result]} ${r.score} mot ${r.opponent}`"
      >
        {{ RESULT_LABEL[r.result] }}
      </li>
    </ol>
  </div>
</template>

<style scoped>
.form-curve {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  font-family: var(--ds-font-body);
}

.form-curve__label {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}

.form-curve__chips {
  display: flex;
  gap: 3px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.form-curve__chip {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: var(--ds-weight-bold);
  letter-spacing: 0;
  color: #ffffff;
  font-variant-numeric: tabular-nums;
  font-family: var(--ds-font-display-sans);
}

.form-curve__chip--w {
  background: var(--ds-color-success);
  color: #ffffff;
}

.form-curve__chip--d {
  background: #BFBEB8;
  color: var(--ds-color-text-primary);
}

.form-curve__chip--l {
  background: var(--ds-color-error);
  color: #ffffff;
}
</style>
