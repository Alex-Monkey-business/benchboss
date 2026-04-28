<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useCoaches } from '../composables/useCoaches'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const router = useRouter()
const { coach, logout } = useAuth()
const { coaches, fetchCoaches } = useCoaches()

const showLogoutDialog = ref(false)

const coachImage = computed(() => coaches.value.find(c => c.name === coach.value?.name)?.image)

onMounted(async () => {
  await fetchCoaches()
})

function confirmLogout() {
  showLogoutDialog.value = false
  logout()
  router.push('/login')
}

const links = [
  {
    to: '/admin/dommerutlegg',
    label: 'Sesongoppgjør',
    description: 'Hvem la ut og oppgjør',
    icon: 'vipps'
  },
  {
    to: '/admin/sesong-kamper',
    label: 'Sesong & kampprogram',
    description: 'Bytt sesong, importer og legg til kamper',
    icon: 'calendar'
  },
  {
    to: '/admin/dommere',
    label: 'Dommere',
    description: 'Pool med dommere og kontaktinfo',
    icon: 'whistle'
  },
  {
    to: '/admin/hospitanter',
    label: 'Hospitanter',
    description: 'G2015-spillere med ekstra kamper',
    icon: 'users'
  }
]
</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <h1 class="page-header__title">Admin</h1>
    </div>

    <div class="px-lg admin-list">
      <router-link
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="admin-row"
      >
        <span class="admin-row__icon">
          <svg v-if="link.icon === 'vipps'" viewBox="35 22 40 28" fill="currentColor">
            <path d="M57.3,40.7c3.7,0,5.8-1.8,7.8-4.4c1.1-1.4,2.5-1.7,3.5-0.9s1.1,2.3,0,3.7c-2.9,3.8-6.6,6.1-11.3,6.1c-5.1,0-9.6-2.8-12.7-7.7c-0.9-1.3-0.7-2.7,0.3-3.4s2.5-0.4,3.4,1C50.5,38.4,53.5,40.7,57.3,40.7z M64.2,28.4c0,1.8-1.4,3-3,3s-3-1.2-3-3s1.4-3,3-3S64.2,26.7,64.2,28.4z"/>
          </svg>
          <svg v-else-if="link.icon === 'calendar'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <svg v-else-if="link.icon === 'whistle'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="16" r="5"/>
            <line x1="12" y1="12" x2="22" y2="2"/>
            <line x1="17" y1="2" x2="22" y2="2"/>
            <line x1="22" y1="2" x2="22" y2="7"/>
          </svg>
          <svg v-else-if="link.icon === 'users'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
        </span>
        <span class="admin-row__body">
          <span class="admin-row__label">{{ link.label }}</span>
          <span class="admin-row__description">{{ link.description }}</span>
        </span>
        <svg class="admin-row__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </router-link>
    </div>

    <div class="px-lg mb-lg" style="margin-top: var(--ds-space-xl);">
      <div class="admin-section-label">Konto</div>
      <div class="admin-account-card">
        <div class="admin-account-card__avatar">
          <img v-if="coachImage" :src="coachImage" :alt="coach.name" class="admin-account-card__avatar-img" />
          <template v-else>{{ coach?.name?.charAt(0) }}</template>
        </div>
        <div class="admin-account-card__info">
          <div class="admin-account-card__name">{{ coach?.name }}</div>
          <button class="admin-account-card__logout" @click="showLogoutDialog = true">Logg ut</button>
        </div>
      </div>
    </div>

    <div style="height: 24px;"></div>

    <ConfirmDialog
      :show="showLogoutDialog"
      title="Logg ut?"
      message="Du kan logge inn igjen med PIN-koden din."
      confirm-label="Logg ut"
      variant="warning"
      @confirm="confirmLogout"
      @cancel="showLogoutDialog = false"
    />
  </div>
</template>

<style scoped>
.admin-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.admin-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  cursor: pointer;
  transition: all 0.15s var(--ds-ease-default);
  text-align: left;
  text-decoration: none;
  color: inherit;
}

.admin-row:hover {
  transform: translate(-2px, -2px);
  box-shadow: var(--ds-shadow-md);
}

.admin-row:active {
  transform: translate(1px, 1px);
  box-shadow: none;
}

.admin-row__icon {
  width: 36px;
  height: 36px;
  border-radius: var(--ds-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--ds-color-accent-light);
  color: var(--ds-color-accent);
}

.admin-row__icon svg {
  width: 18px;
  height: 18px;
}

.admin-row__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.admin-row__label {
  font-weight: 500;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.3;
}

.admin-row__description {
  font-size: 0.75rem;
  color: var(--ds-color-text-tertiary);
  margin-top: 2px;
  line-height: 1.4;
}

.admin-row__chevron {
  color: var(--ds-color-text-tertiary);
  flex-shrink: 0;
}

.admin-section-label {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ds-color-text-tertiary);
  padding: 0 4px;
  margin-bottom: 8px;
}

.admin-account-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
}

.admin-account-card__avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--ds-color-accent-light);
  color: var(--ds-color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-family: var(--ds-font-heading);
  font-size: 1rem;
  flex-shrink: 0;
  overflow: hidden;
}

.admin-account-card__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.admin-account-card__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.admin-account-card__name {
  font-weight: 600;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
}

.admin-account-card__logout {
  align-self: flex-start;
  margin-top: 4px;
  background: transparent;
  border: 0;
  padding: 0;
  font-size: 0.8125rem;
  color: var(--ds-color-error);
  cursor: pointer;
  font-family: var(--ds-font-body);
}

.admin-account-card__logout:hover {
  text-decoration: underline;
}
</style>
