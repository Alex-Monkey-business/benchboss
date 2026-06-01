<script setup>
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'

const router = useRouter()
const { isParent, logout } = useAuth()

function doLogout() {
  logout()
  router.push('/login')
}
</script>

<template>
  <div class="cuptabs">
    <div class="cuptabs__seg">
      <router-link to="/cup" class="seg" :class="{ 'seg--active': $route.name === 'cup' }">Kamper</router-link>
      <router-link to="/cup/tropp" class="seg" :class="{ 'seg--active': $route.name === 'cup-tropp' }">Tropp</router-link>
    </div>
    <button v-if="isParent" type="button" class="cuptabs__logout" @click="doLogout">Logg ut</button>
  </div>
</template>

<style scoped>
.cuptabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm) var(--ds-space-md);
  margin-bottom: var(--ds-space-lg);
}
.cuptabs__seg {
  display: inline-flex;
  background: var(--ds-color-bg-sunken);
  border-radius: var(--ds-radius-full);
  padding: 3px;
}
.seg {
  appearance: none;
  border: none;
  background: transparent;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  padding: 7px 18px;
  border-radius: var(--ds-radius-full);
  cursor: pointer;
  transition: background var(--ds-duration-fast) var(--ds-ease-out), color var(--ds-duration-fast) var(--ds-ease-out);
}
.seg--active {
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  box-shadow: var(--ds-shadow-xs);
}
.cuptabs__logout {
  appearance: none;
  border: var(--ds-border-width) solid var(--ds-color-border);
  background: transparent;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  padding: 6px 12px;
  border-radius: var(--ds-radius-full);
  cursor: pointer;
  white-space: nowrap;
}
.cuptabs__logout:hover { background: var(--ds-color-bg-hover); }
</style>
