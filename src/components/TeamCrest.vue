<script setup>
import { computed } from 'vue'
import { isOurs, teamSlugFromName } from '../lib/matchMeta'

// Der FotMob har klubbmerket, har vi dette: initialer i en sirkel. Våre lag
// fylt i lagets farge, motstanderen dempet. Samme plass i hver rad, så øyet
// finner midtaksen uten å lese.
const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 28 }
})

const ours = computed(() => isOurs(props.name))
const slug = computed(() => (ours.value ? teamSlugFromName(props.name) : ''))

const initials = computed(() => {
  const words = props.name.split(/\s+/).filter(w => w.length > 2 && w !== w.toUpperCase())
  const pick = (words.length ? words : props.name.split(/\s+/)).slice(0, 2)
  return pick.map(w => w[0]).join('').toUpperCase()
})
</script>

<template>
  <span
    class="crest"
    :class="[ours ? `crest--ours crest--${slug || 'other'}` : 'crest--them']"
    :style="{ '--crest-size': size + 'px' }"
    aria-hidden="true"
  >
    <span class="crest__initials">{{ initials }}</span>
  </span>
</template>

<style scoped>
.crest {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--crest-size);
  height: var(--crest-size);
  border-radius: 50%;
}

.crest--them {
  background: var(--ds-color-bg-sunken);
  color: var(--ds-color-text-secondary);
}

.crest__initials {
  font-family: var(--ds-font-body);
  font-size: calc(var(--crest-size) * 0.36);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.02em;
  line-height: 1;
}

/* Våre lag: fylt i lagets farge, initialene i lagets lyse tone. Det snur
   riktig i mørkt tema, der lagfargene er pastell og bg-tonen er mørk. */
.crest--ours { background: var(--ds-color-text-tertiary); color: var(--ds-color-bg); }
.crest--gronn { background: var(--ds-team-gronn); color: var(--ds-team-gronn-bg); }
.crest--rod { background: var(--ds-team-rod); color: var(--ds-team-rod-bg); }
.crest--hvit {
  background: var(--ds-team-hvit-bg);
  color: var(--ds-team-hvit);
  box-shadow: inset 0 0 0 2px var(--ds-team-hvit-border);
}
</style>
