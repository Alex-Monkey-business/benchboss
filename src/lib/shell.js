import { ref } from 'vue'

// Skallet (bunnmenyen) kan skjules av en visning som trenger hele skjermen.
// Live kampmodus er den eneste brukeren i dag: treneren på sidelinja skal ha
// banen, ikke fem faner hen ikke skal trykke på. Visningen nullstiller selv
// når den forlates.
export const navHidden = ref(false)
