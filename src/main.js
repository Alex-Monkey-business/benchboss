import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { startVersionCheck } from './composables/useVersionCheck'
import '../design-system/index.css'
import './assets/app.css'

startVersionCheck()
createApp(App).use(router).mount('#app')
