<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useCoaches } from '../composables/useCoaches'
import PinInput from '../components/PinInput.vue'

const route = useRoute()
const router = useRouter()
const { login } = useAuth()
const { coaches, fetchCoaches, verifyPin } = useCoaches()

const selectedCoach = ref(null)
const pinError = ref(false)
const pinRef = ref(null)

const currentCoach = computed(() => coaches.value.find(c => c.id === selectedCoach.value))

onMounted(async () => {
  await fetchCoaches()
  if (coaches.value.length > 0) {
    selectedCoach.value = coaches.value[0].id
  }
})

async function onPinComplete(pin) {
  const isValid = await verifyPin(selectedCoach.value, pin)
  if (isValid) {
    const coach = coaches.value.find(c => c.id === selectedCoach.value)
    login({ id: coach.id, name: coach.name })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(redirect)
  } else {
    pinError.value = true
    setTimeout(() => {
      pinError.value = false
      pinRef.value?.clear()
    }, 600)
  }
}
</script>

<template>
  <div class="login-screen">
    <div class="login-content">
      <!-- Coach avatar — transitions on selection change -->
      <Transition name="avatar-swap" mode="out-in">
        <div class="login-avatar" :key="selectedCoach">
          <img v-if="currentCoach?.image" :src="currentCoach.image" :alt="currentCoach?.name" class="login-avatar__img" />
          <span v-else class="login-avatar__initial">{{ currentCoach?.name?.charAt(0) || '?' }}</span>
        </div>
      </Transition>
      <h1 class="login-content__title">BenchBoss</h1>

      <div class="login-content__form">
        <div class="ds-form-group">
          <label class="ds-label">Hvem er du?</label>
          <select v-model="selectedCoach" class="ds-input ds-select">
            <option v-for="c in coaches" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
        </div>

        <div class="ds-form-group">
          <label class="ds-label">PIN-kode</label>
          <PinInput ref="pinRef" :error="pinError" @complete="onPinComplete" />
          <Transition name="ds-fade">
            <p v-if="pinError" class="ds-help ds-help--error" style="text-align: center; margin-top: 12px;">
              Feil PIN-kode
            </p>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-screen {
  min-height: 100dvh;
  background: var(--ds-color-bg);
  position: relative;
  overflow: hidden;
}

.login-content {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--ds-space-xl) var(--ds-space-xl) 48px;
}

/* Coach avatar circle */
.login-avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: var(--ds-color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  border: 3px solid var(--ds-color-border);
  box-shadow: var(--ds-shadow-md);
  overflow: hidden;
}

.login-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.login-avatar__initial {
  font-family: var(--ds-font-heading);
  font-size: 2.25rem;
  font-weight: 700;
  color: white;
  line-height: 1;
}

/* Avatar swap transition */
.avatar-swap-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.avatar-swap-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.avatar-swap-enter-from {
  opacity: 0;
  transform: scale(0.85);
}
.avatar-swap-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

.login-content__title {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-2xl);
  font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
  text-align: center;
  margin-bottom: 40px;
  line-height: var(--ds-leading-tight);
}

.login-content__form {
  width: 100%;
  max-width: 320px;
}

.login-content__form .ds-form-group {
  margin-bottom: var(--ds-space-xl);
}
</style>
