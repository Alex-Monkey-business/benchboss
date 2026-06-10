<script setup>
import { usePwaInstall } from '../composables/usePwaInstall'

// Android/Chrome one-tap install only. iOS is handled by the global
// IosInstallBanner, so this card stays hidden on iPhone and when installed.
const { canPromptInstall, promptInstall } = usePwaInstall()
</script>

<template>
  <section v-if="canPromptInstall" class="install-section">
    <button type="button" class="install-card" @click="promptInstall">
      <img src="/icons/icon-192.png" alt="" class="install-card__icon" />
      <span class="install-card__body">
        <span class="install-card__title">Legg BenchBoss på hjemskjermen</span>
        <span class="install-card__lead">Eget app-ikon, åpner i fullskjerm</span>
      </span>
      <span class="install-card__cta">Legg til</span>
    </button>
  </section>
</template>

<style scoped>
.install-section {
  padding: 0 var(--ds-space-lg);
  margin-top: var(--ds-space-xl);
}

.install-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 12px 16px;
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  cursor: pointer;
  text-align: left;
  font-family: var(--ds-font-body);
  -webkit-tap-highlight-color: transparent;
}

.install-card:active {
  transform: scale(0.99);
}

.install-card__icon {
  width: 44px;
  height: 44px;
  border-radius: var(--ds-radius-md);
  flex-shrink: 0;
}

.install-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.install-card__title {
  font-weight: var(--ds-weight-semibold);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.25;
}

.install-card__lead {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
}

.install-card__cta {
  flex-shrink: 0;
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-accent);
}
</style>
