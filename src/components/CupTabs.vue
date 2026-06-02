<script setup>
// Cup-undernavigasjon (Kamper | Tropp). Logg-ut ligger i den globale BottomNav.
</script>

<template>
  <div class="cuptabs">
    <div class="cuptabs__bar" role="tablist">
      <router-link
        to="/cup"
        role="tab"
        class="cuptabs__tab"
        :class="{ 'cuptabs__tab--active': $route.name === 'cup' }"
      >Kamper</router-link>
      <router-link
        to="/cup/tropp"
        role="tab"
        class="cuptabs__tab"
        :class="{ 'cuptabs__tab--active': $route.name === 'cup-tropp' }"
      >Tropp</router-link>
    </div>
  </div>
</template>

<style scoped>
/* Samme underline-tab-stil som Kommende/Tidligere på kampoversikten */
.cuptabs {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-md);
}
.cuptabs__bar {
  display: flex;
  gap: 24px;
  flex: 1;
  border-bottom: 1px solid var(--ds-color-border-light);
}
.cuptabs__tab {
  display: inline-flex;
  align-items: center;
  padding: 12px 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ds-color-text-tertiary);
  font-family: var(--ds-font-body);
  font-size: 0.9375rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
  margin-bottom: -1px;
}
.cuptabs__tab:hover { color: var(--ds-color-text-primary); }
.cuptabs__tab--active {
  color: var(--ds-color-text-primary);
  border-bottom-color: var(--ds-color-accent);
}
</style>
