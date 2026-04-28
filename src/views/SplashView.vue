<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'

const router = useRouter()
const { isLoggedIn } = useAuth()

const step1 = ref(false)
const step2 = ref(false)
const step3 = ref(false)
const leaving = ref(false)

onMounted(() => {
  requestAnimationFrame(() => { step1.value = true })
  setTimeout(() => { step2.value = true }, 400)
  setTimeout(() => { step3.value = true }, 800)

  setTimeout(() => {
    leaving.value = true
    setTimeout(() => {
      router.replace(isLoggedIn.value ? '/' : '/login')
    }, 500)
  }, 2600)
})
</script>

<template>
  <div class="splash" :class="{ 'splash--leaving': leaving }">
    <div class="splash__content">
      <div class="splash__illustration" :class="{ 'splash__illustration--in': step1 }">
        <img src="/illustrations/true-fan.png" alt="" width="160" height="160" />
      </div>

      <p class="splash__welcome" :class="{ 'splash__welcome--in': step2 }">
        Velkommen til
      </p>

      <h1 class="splash__title" :class="{ 'splash__title--in': step2 }">
        Bench<span class="splash__accent">Boss</span>
      </h1>

      <p class="splash__tagline" :class="{ 'splash__tagline--in': step3 }">
        Built for the beautiful chaos of grassroots football
      </p>

      <div class="splash__dots" :class="{ 'splash__dots--in': step3 }">
        <span></span><span></span><span></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.splash {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-color-bg);
  position: relative;
  overflow: hidden;
  transition: opacity 0.5s ease;
}

.splash--leaving {
  opacity: 0;
  transform: scale(1.04);
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.splash__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 1;
}

/* Illustration with bounce-in */
.splash__illustration {
  margin-bottom: 28px;
  opacity: 0;
  transform: translateY(40px) scale(0.5);
  transition: all 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.splash__illustration--in {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.splash__illustration img {
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 8px 24px rgba(37, 99, 235, 0.18));
}

/* Welcome text */
.splash__welcome {
  font-family: var(--ds-font-heading);
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--ds-color-text-secondary);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin: 0 0 6px;
  opacity: 0;
  transform: translateY(16px);
  transition: all 0.5s ease;
}

.splash__welcome--in {
  opacity: 1;
  transform: translateY(0);
}

/* Title */
.splash__title {
  font-family: var(--ds-font-heading);
  font-size: 2rem;
  font-weight: 900;
  color: var(--ds-color-text-primary);
  letter-spacing: -0.02em;
  line-height: 1;
  margin: 0;
  text-align: center;
  opacity: 0;
  transform: translateY(16px);
  transition: all 0.5s ease 0.1s;
}

.splash__welcome--in ~ .splash__title,
.splash__title--in {
  opacity: 1;
  transform: translateY(0);
}

.splash__accent {
  color: var(--ds-color-accent);
}

/* Tagline */
.splash__tagline {
  font-family: var(--ds-font-body);
  font-size: 0.875rem;
  font-weight: 400;
  color: var(--ds-color-text-secondary);
  text-align: center;
  max-width: 280px;
  line-height: 1.5;
  margin: 12px 0 0;
  opacity: 0;
  transform: translateY(12px);
  transition: all 0.6s ease;
}

.splash__tagline--in {
  opacity: 1;
  transform: translateY(0);
}

/* Loading dots */
.splash__dots {
  display: flex;
  gap: 6px;
  margin-top: 24px;
  opacity: 0;
  transition: opacity 0.4s ease;
}

.splash__dots--in {
  opacity: 1;
}

.splash__dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ds-color-accent);
  animation: pulse 1s ease-in-out infinite;
}

.splash__dots span:nth-child(2) {
  animation-delay: 0.15s;
}

.splash__dots span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes pulse {
  0%, 100% { opacity: 0.25; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.1); }
}
</style>
