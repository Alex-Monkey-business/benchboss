import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { startVersionCheck } from './composables/useVersionCheck'
// Side-effect import: applies stored theme to <html> before first paint
import './composables/useTheme'
import '../design-system/index.css'
import './assets/app.css'

startVersionCheck()
createApp(App).use(router).mount('#app')
