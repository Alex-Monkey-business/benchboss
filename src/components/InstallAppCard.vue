<script setup>
import { ref } from 'vue'
import { usePwaInstall } from '../composables/usePwaInstall'

const { isInstalled, canPromptInstall, needsManualInstall, promptInstall } = usePwaInstall()

const showIosSteps = ref(false)

async function onInstall() {
  if (canPromptInstall.value) {
    await promptInstall()
  } else if (needsManualInstall.value) {
    showIosSteps.value = !showIosSteps.value
  }
}
</script>

<template>
  <!-- Hidden once the app is installed, and on browsers that can't install at all -->
  <section v-if="!isInstalled && (canPromptInstall || needsManualInstall)" class="install-section">
    <div class="install-card">
    <button type="button" class="install-card__main" @click="onInstall">
      <img src="/icons/icon-192.png" alt="" class="install-card__icon" />
      <span class="install-card__body">
        <span class="install-card__title">Legg BenchBoss på hjemskjermen</span>
        <span class="install-card__lead">Eget app-ikon, åpner i fullskjerm</span>
      </span>
      <span class="install-card__cta">{{ needsManualInstall ? 'Vis hvordan' : 'Legg til' }}</span>
    </button>

    <div v-if="needsManualInstall && showIosSteps" class="install-card__steps">
      <p class="install-card__step">
        <span class="install-card__step-num">1</span>
        Trykk Del-ikonet
        <svg class="install-card__share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3v13" />
          <path d="m8 7 4-4 4 4" />
          <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
        </svg>
        nederst i Safari
      </p>
      <p class="install-card__step">
        <span class="install-card__step-num">2</span>
        Velg «Legg til på Hjemskjerm»
      </p>
    </div>
    </div>
  </section>
</template>

<style scoped>
.install-section {
  padding: 0 var(--ds-space-lg);
  margin-top: var(--ds-space-xl);
}

.install-card {
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  overflow: hidden;
}

.install-card__main {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  font-family: var(--ds-font-body);
  -webkit-tap-highlight-color: transparent;
}

.install-card__main:active {
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

.install-card__steps {
  border-top: var(--ds-border-width) solid var(--ds-color-border);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.install-card__step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  margin: 0;
}

.install-card__step-num {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--ds-color-accent-light);
  color: var(--ds-color-accent);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.install-card__share {
  width: 16px;
  height: 16px;
  color: var(--ds-color-accent);
  flex-shrink: 0;
}
</style>
