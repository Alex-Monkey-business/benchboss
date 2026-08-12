<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useCoaches } from '../composables/useCoaches'
import { useTheme } from '../composables/useTheme'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import InstallAppCard from '../components/InstallAppCard.vue'

const router = useRouter()
const { coach, logout, isAdmin, isPlatformAdmin } = useAuth()
const { coaches, fetchCoaches } = useCoaches()
const { theme, setTheme } = useTheme()

const THEME_OPTIONS = [
  { value: 'light', label: 'Lys' },
  { value: 'dark', label: 'Mørk' },
  { value: 'system', label: 'System' }
]

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

// Tilgang vises kun for admin. En vanlig trener ser uansett bare sin egen rad
// (RLS), så lenken ville ført til en liste med én person.
// NB: skrus `allow_coach_invites` på for et kull, må både denne betingelsen og
// select-policyen på cohort_members ta høyde for trenere.
const links = computed(() => [
  ...(isAdmin.value || isPlatformAdmin.value
    ? [{ to: '/admin/tilgang', label: 'Tilgang', icon: 'people' }]
    : []),
  { to: '/admin/dommerutlegg', label: 'Sesongoppgjør', icon: 'vipps' },
  { to: '/admin/sesong-kamper', label: 'Sesong & kampprogram', icon: 'calendar' },
  { to: '/admin/dommere', label: 'Dommere', icon: 'whistle' },
  { to: '/serie/tropp', label: 'Spillere & tropp', icon: 'jersey' },
  { to: '/cup', label: 'Turneringer', icon: 'trophy' }
])
</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <h1 class="page-header__title">Admin</h1>
    </div>

    <div class="px-lg" style="margin-bottom: 6px;">
      <span class="admin-section-label" style="margin-left: 4px;">Verktøy</span>
    </div>

    <div class="px-lg admin-list">
      <router-link
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="admin-row"
      >
        <span class="admin-row__icon">
          <svg v-if="link.icon === 'people'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <svg v-else-if="link.icon === 'vipps'" viewBox="35 22 40 28" fill="currentColor">
            <path d="M57.3,40.7c3.7,0,5.8-1.8,7.8-4.4c1.1-1.4,2.5-1.7,3.5-0.9s1.1,2.3,0,3.7c-2.9,3.8-6.6,6.1-11.3,6.1c-5.1,0-9.6-2.8-12.7-7.7c-0.9-1.3-0.7-2.7,0.3-3.4s2.5-0.4,3.4,1C50.5,38.4,53.5,40.7,57.3,40.7z M64.2,28.4c0,1.8-1.4,3-3,3s-3-1.2-3-3s1.4-3,3-3S64.2,26.7,64.2,28.4z"/>
          </svg>
          <svg v-else-if="link.icon === 'calendar'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <svg v-else-if="link.icon === 'whistle'" class="icon--wide" viewBox="0 0 473 296" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M284.905 0.425146C306.948 -1.97707 339.141 5.96786 356.503 20.0267C364.583 26.5708 373.088 34.6402 380.786 41.7611C397.525 57.4304 413.993 73.3832 430.186 89.6124C436.181 95.5755 442.067 101.646 447.842 107.822C451.48 111.704 456.131 116.486 458.928 120.91C466.331 132.621 470.567 147.114 471.97 160.765C474.809 188.382 464.984 218.808 447.169 239.994C442.131 245.984 437.731 250.311 432.507 255.697C419.033 269.581 408.493 276.549 390.62 284.124C376.651 290.042 367.33 292.965 352.011 294.271C335.557 295.674 320.029 295.989 304.042 291.159C297.691 289.321 291.087 287.153 285.278 283.915C256.697 267.983 237.708 238.178 212.885 217.808C208.51 219.815 203.605 222.68 199.367 225.058L119.089 269.3C111.31 273.534 103.501 277.715 95.6637 281.841C90.2178 284.697 83.9884 288.016 78.3639 290.337C74.2197 286.88 69.176 281.649 65.3318 277.754C58.8071 271.187 52.376 264.528 46.0403 257.78L0 208.853C0.254106 192.641 0.413029 176.427 0.477042 160.213C0.537716 152.439 1.02422 144.228 0.757312 136.512C19.0661 127.494 38.9072 116.468 57.1336 106.858L178.404 43.2318L220.215 21.8836C228.022 17.921 240.56 11.3299 248.479 8.32051C260.171 3.92838 272.442 1.26838 284.905 0.425146ZM359.124 84.5395C375.345 83.5872 391.526 85.0743 406.876 90.6677C426.453 97.8025 446.119 114.144 454.95 133.244C465.345 155.733 465.532 180.753 456.99 203.853C445.003 236.271 418.846 261.173 387.769 275.416C361.239 287.573 327.282 290.156 299.747 279.878C278.055 271.785 259.794 255.837 250.165 234.629C246.382 226.297 241.821 210.955 243.176 201.923C243.454 200.066 244.406 198.312 245.035 196.554C245.447 195.401 245.789 193.841 245.183 192.702C244.701 191.794 243.435 191.204 242.486 190.958C239.992 190.311 218.137 202.903 213.859 205.232C170.902 228.744 128.199 254.058 85.1541 277.061C84.104 270.51 84.2103 260.422 84.1891 253.643L84.1758 222.237C87.3862 220.906 94.4002 216.803 97.8143 214.929L124.055 200.567L258.948 126.885L300.763 104.372C322.614 92.7589 333.51 86.6372 359.124 84.5395ZM249.633 23.4116L249.945 23.3955C252.191 24.3824 275.192 49.8883 279.083 53.5561C283.377 57.6053 296.377 72.3005 299.545 77.3371C298.918 78.0131 298.256 78.6559 297.563 79.2627C293.878 82.4612 270.747 95.9633 267.852 95.7534C264.284 92.7256 260.054 88.4036 256.694 85.0733C250.794 79.2157 244.93 73.3256 239.096 67.4034C234.359 62.6541 229.697 57.8285 225.116 52.9286C223.36 51.0484 216.969 44.8509 217.413 42.3443C220.273 37.4666 243.168 26.639 249.633 23.4116Z"/>
          </svg>
          <svg v-else-if="link.icon === 'jersey'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 3 4 5.5 5.8 9l1.7-.8V21h9V8.2l1.7.8L20 5.5 15.5 3a3.5 3.5 0 0 1-7 0z"/>
          </svg>
          <svg v-else-if="link.icon === 'trophy'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/>
            <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>
          </svg>
        </span>
        <span class="admin-row__label">{{ link.label }}</span>
        <svg class="admin-row__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </router-link>
    </div>

    <InstallAppCard />

    <div class="px-lg" style="margin-top: var(--ds-space-xl);">
      <div class="admin-section-label">Utseende</div>
      <div class="theme-toggle" role="radiogroup" aria-label="Velg fargetema">
        <button
          v-for="opt in THEME_OPTIONS"
          :key="opt.value"
          type="button"
          role="radio"
          :aria-checked="theme === opt.value"
          :class="['theme-toggle__option', { 'theme-toggle__option--active': theme === opt.value }]"
          @click="setTheme(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
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

.admin-row__icon svg.icon--wide {
  width: 28px;
  height: auto;
}

.admin-row__label {
  flex: 1;
  font-weight: 500;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
  line-height: 1.3;
  min-width: 0;
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

/* Theme toggle — segmented control style */
.theme-toggle {
  display: inline-flex;
  padding: 3px;
  background: var(--ds-color-bg-subtle);
  border-radius: var(--ds-radius-md);
  gap: 2px;
}

.theme-toggle__option {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 8px 16px;
  border-radius: var(--ds-radius-sm);
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  letter-spacing: -0.005em;
  transition:
    background-color var(--ds-duration-fast) var(--ds-ease-out),
    color var(--ds-duration-fast) var(--ds-ease-out);
  -webkit-tap-highlight-color: transparent;
}

.theme-toggle__option:active {
  transform: scale(0.97);
}

.theme-toggle__option--active {
  background: var(--ds-color-bg-elevated);
  color: var(--ds-color-text-primary);
  font-weight: var(--ds-weight-semibold);
  box-shadow: var(--ds-shadow-xs);
}
</style>
