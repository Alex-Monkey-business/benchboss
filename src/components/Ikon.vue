<script setup>
// Ett ikonsett for hele appen: Phosphor. Navnene er våre egne, så en skjerm
// spør etter «slett», ikke etter en bestemt tegning. Tegningene ligger i
// lib/ikoner.js, som lages av scripts/bygg-ikoner.mjs. Nytt ikon legges til der.
//
// To vekter: «regular» er standard, «bold» der ikonet skal bære mer (hake,
// pluss, små piler). Størrelsen settes av stedet som bruker ikonet, med CSS
// på klassen eller med `size`. Uten noen av delene er ikonet 1em.
import { computed } from 'vue'
import { IKONER } from '../lib/ikoner'

const props = defineProps({
  navn: { type: String, required: true },
  vekt: { type: String, default: 'regular' },
  size: { type: [Number, String], default: '1em' }
})
const innhold = computed(() => IKONER[props.navn]?.[props.vekt] || IKONER[props.navn]?.regular || '')
</script>

<template>
  <svg viewBox="0 0 256 256" :width="size" :height="size" fill="currentColor" aria-hidden="true" v-html="innhold" />
</template>
