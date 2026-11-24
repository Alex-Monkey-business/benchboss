<script setup>
import Ikon from '../components/Ikon.vue'
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useFeatures } from '../composables/useFeatures'
import { useCoaches } from '../composables/useCoaches'
import { useTheme } from '../composables/useTheme'
import { useDesign } from '../composables/useDesign'
import { clubLogo } from '../lib/klubblogo'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import InstallAppCard from '../components/InstallAppCard.vue'

const router = useRouter()
const { coach, logout, isAdmin, isPlatformAdmin, memberships, activeCohort, setActiveCohort } = useAuth()
const { usesReferees } = useFeatures()

const { coaches, fetchCoaches } = useCoaches()

// Klubbmerket gjør kull-velgeren til noe man kjenner igjen på en halv
// sekund. Mangler koblingen til fotball.no, står navnet alene.
const klubbmerke = m => clubLogo(m.club_fiks_id)
const { theme, setTheme } = useTheme()
const { design, setDesign } = useDesign()

const THEME_OPTIONS = [
  { value: 'light', label: 'Lys' },
  { value: 'dark', label: 'Mørk' },
  { value: 'system', label: 'System' }
]

// Egen akse fra temaet: Whspr finnes i både lys og mørk.
const DESIGN_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'whspr', label: 'Whspr' }
]

const showLogoutDialog = ref(false)

const coachImage = computed(() => coaches.value.find(c => c.name === coach.value?.name)?.image)

onMounted(async () => {
  await fetchCoaches()
})

// Kull-velgeren finnes bare for den som er medlem av flere. Bytte tømmer
// data-composablene og sender deg til Hjem — der er det tydeligst at
// alt du ser nå er et annet kull.
function switchCohort(id) {
  if (id === activeCohort.value?.id) return
  setActiveCohort(id)
  router.push('/')
}

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
  ...(isPlatformAdmin.value
    ? [{ to: '/admin/plattform', label: 'Klubber og kull', icon: 'building' }]
    : []),
  ...(isAdmin.value || isPlatformAdmin.value
    ? [{ to: '/admin/tilgang', label: 'Tilgang', icon: 'people' }]
    : []),
  // Sesongoppgjøret er IKKE bare utlegg — det er eneste stedet en sesong
  // avsluttes. Raden blir stående uansett; bare navnet og innholdet endrer seg
  // når laget ikke skaffer dommer selv.
  { to: '/admin/dommerutlegg', label: usesReferees.value ? 'Sesongoppgjør' : 'Sesong', icon: usesReferees.value ? 'vipps' : 'calendar' },
  { to: '/admin/sesong-kamper', label: 'Sesong og terminliste', icon: 'calendar' },
  // Dommerlista har derimot ingen annen jobb.
  ...(usesReferees.value ? [{ to: '/admin/dommere', label: 'Dommere', icon: 'whistle' }] : []),
  { to: '/admin/referater', label: 'Møtereferater', icon: 'notes' },
  { to: '/serie/tropp', label: 'Spillere og tropp', icon: 'jersey' },
  { to: '/admin/niva', label: 'Nivå', icon: 'levels' },
  { to: '/admin/turneringer', label: 'Cuper', icon: 'trophy' }
])
</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <h1 class="page-header__title">Admin</h1>
    </div>

    <div v-if="memberships.length > 1" class="px-lg" style="margin-bottom: var(--ds-space-xl);">
      <div class="admin-section-label">Kull</div>
      <div class="theme-toggle theme-toggle--wrap" role="radiogroup" aria-label="Velg kull">
        <button
          v-for="m in memberships"
          :key="m.cohort_id"
          type="button"
          role="radio"
          :aria-checked="m.cohort_id === activeCohort?.id"
          :class="['theme-toggle__option', 'admin-kull__valg', { 'theme-toggle__option--active': m.cohort_id === activeCohort?.id }]"
          @click="switchCohort(m.cohort_id)"
        >
          <img
            v-if="klubbmerke(m)"
            class="admin-kull__merke"
            :src="klubbmerke(m)"
            alt=""
            width="20"
            height="20"
            loading="lazy"
            @error="$event.target.style.display = 'none'"
          />
          {{ m.cohort_name }}
        </button>
      </div>
    </div>

    <div class="px-lg" style="margin-bottom: 6px;">
      <span class="admin-section-label" style="margin-left: 4px;">Verktøy</span>
    </div>

    <div class="px-lg admin-list">
      <div class="admin-list__group">
      <router-link
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="admin-row"
      >
        <span class="admin-row__label">{{ link.label }}</span>
        <Ikon navn="pil-hoyre" vekt="bold" :size="16" class="admin-row__chevron" />
      </router-link>
      </div>
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

      <div class="design-row">
        <div class="theme-toggle" role="radiogroup" aria-label="Velg design">
          <button
            v-for="opt in DESIGN_OPTIONS"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="design === opt.value"
            :class="['theme-toggle__option', { 'theme-toggle__option--active': design === opt.value }]"
            @click="setDesign(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
        <span class="design-beta">Beta</span>
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
      message="Du kan logge inn igjen med e-posten din."
      confirm-label="Logg ut"
      variant="warning"
      @confirm="confirmLogout"
      @cancel="showLogoutDialog = false"
    />
  </div>
</template>

<style scoped>
/* Merket og navnet er én linje. Uten dette la knappens sentrering merket
   på egen rad over teksten. */
.admin-kull__valg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-sm);
}

.admin-kull__merke {
  flex: none;
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.admin-list {
  display: flex;
  flex-direction: column;
}

/* Verktøyene er én gruppe, ikke sju kort: én flate med skillelinjer, så
   lista leses som en meny og ikke som sju like viktige ting. */
.admin-list__group {
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  overflow: hidden;
}

.admin-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  width: 100%;
  min-height: 56px;
  padding: var(--ds-space-12) var(--ds-space-md);
  cursor: pointer;
  transition: background-color 150ms var(--ds-ease-default);
  text-align: left;
  text-decoration: none;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
}

/* Skillelinja starter ved teksten, ikke ved kanten. */
.admin-row + .admin-row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 16px;
  right: 0;
  border-top: var(--ds-border-width) solid var(--ds-color-border-light);
}

@media (hover: hover) and (pointer: fine) {
  .admin-row:hover { background: var(--ds-color-bg-subtle); }
}

.admin-row:active { background: var(--ds-color-bg-subtle); }

.admin-row__label {
  flex: 1;
  font-weight: 500;
  font-size: var(--ds-text-base);
  color: var(--ds-color-text-primary);
  line-height: 1.3;
  min-width: 0;
}

.admin-row__chevron {
  color: var(--ds-color-text-tertiary);
  flex-shrink: 0;
}

.admin-section-label {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  letter-spacing: normal;
  color: var(--ds-color-text-tertiary);
  padding: 0;
  margin-bottom: var(--ds-space-sm);
}

.admin-account-card {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  padding: var(--ds-space-md) var(--ds-space-md);
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
  font-size: var(--ds-text-base);
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
  margin: calc(var(--ds-space-sm) * -1) 0 calc(var(--ds-space-12) * -1) calc(var(--ds-space-sm) * -1);
  min-height: 44px;
  background: transparent;
  border: 0;
  border-radius: var(--ds-radius-md);
  padding: 0 var(--ds-space-sm);
  font-size: var(--ds-text-xs);
  color: var(--ds-color-warm-text);
  cursor: pointer;
  font-family: var(--ds-font-body);
}

.admin-account-card__logout:hover {
  text-decoration: underline;
}

/* Theme toggle — segmented control style */
.design-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
}
.design-beta {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-medium);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
}
.design-note {
  margin: var(--ds-space-sm) 0 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
}
.theme-toggle {
  display: inline-flex;
  padding: 0;
  background: var(--ds-color-bg-subtle);
  border-radius: var(--ds-radius-full);
  gap: var(--ds-space-2xs);
}

/* Brekker gruppa over flere rader, er den løse chips, ikke ett omslag:
   et pilleformet omslag rundt to rader blir en klump. Hver chip bærer da
   sin egen flate, og den valgte får ring i stedet for skygge. */
.theme-toggle--wrap {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-sm);
  padding: 0;
  background: transparent;
  border-radius: 0;
}

.theme-toggle--wrap .theme-toggle__option {
  flex: 0 1 auto;
  background: var(--ds-color-bg-subtle);
  min-height: var(--ds-btn-h);
  font-weight: var(--ds-weight-semibold);
}

/* Valgt kull: fylt aksent, som de andre aktive pillene i appen. */
.theme-toggle--wrap .theme-toggle__option--active {
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
}

.theme-toggle__option {
  appearance: none;
  border: 0;
  background: transparent;
  min-height: 44px;
  padding: 0 var(--ds-space-md);
  border-radius: var(--ds-radius-full);
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
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
  font-weight: var(--ds-weight-semibold);
}

</style>
