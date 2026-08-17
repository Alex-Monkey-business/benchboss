<script setup>
import { computed } from 'vue'
import { weekdayDateLabel } from '../../lib/dateLabels'
import { teamLabel } from '../../lib/matchMeta'

// event fra useToday.nextMatch: { type: 'match'|'cup', date, time, opponent,
// teams (fargeslugs), teamName (cup), isHome, pitch, round, to }
const props = defineProps({
  event: { type: Object, required: true },
  // prep fra useToday.prepFor — { isHome, referee, lineup, squad, status }.
  // Null når kampen ikke er hentet ennå; da sier vi ingenting om den.
  prep: { type: Object, default: null }
})

// Bare det som MANGLER. Kampdag-kortet har full sjekkliste med haker — der
// er du i gang. Her er poenget å se på ett blikk om noe står igjen, og
// er alt på plass skal kortet tie om det.
const missing = computed(() => {
  const p = props.prep
  if (!p) return []
  const out = []
  if (p.referee === false) out.push('dommer')
  if (!p.lineup) out.push('oppstilling')
  return out
})

// «dommer og tropp og oppstilling» er ikke norsk. Komma til det siste leddet.
const missingLine = computed(() => {
  const m = missing.value
  if (m.length < 2) return m[0] || ''
  return `${m.slice(0, -1).join(', ')} og ${m[m.length - 1]}`
})


// «Onsdag 19 aug · 18:00». Én form, ingen betingelser.
//
// Her sto det før tre regler i én linje: relativt dagsnavn, dato bare når
// kampen var mer enn en uke unna, og hjemme/borte på slutten. Resultatet var
// at linja endret form etter hvor nær kampen var, og at den ble lang nok til å
// brekke. Hjemme/borte er en EGENSKAP ved kampen, ikke en del av «når» — den
// står nå som merkelapp øverst, slik kampdag-kortet alt gjør det.
const detailLine = computed(() => {
  const parts = [weekdayDateLabel(props.event.date)]
  const t = (props.event.time || '').slice(0, 5)
  if (t && t !== '00:00') parts.push(t)
  // Cup har ingen hjemme/borte — der er banen det som plasserer kampen.
  if (props.event.type === 'cup' && props.event.pitch) parts.push(props.event.pitch)
  return parts.join(' · ')
})
</script>

<template>
  <router-link :to="event.to" class="ds-card ds-card--interactive next-match">
    <div class="next-match__row">
    <div class="next-match__body">
    <div class="next-match__top">
      <span class="next-match__tags">
        <span
          v-for="color in event.teams || []"
          :key="color"
          class="next-match__team-tag"
          :class="`next-match__team-tag--${color}`"
        >{{ teamLabel(color) }}</span>
        <span v-if="event.teamName" class="next-match__team-tag next-match__team-tag--cup">{{ event.teamName }}</span>
        <span v-if="event.type !== 'cup'" class="next-match__venue">{{ event.isHome ? 'Hjemme' : 'Borte' }}</span>
        <span class="next-match__kicker">{{ event.type === 'cup' ? 'Neste cupkamp' : 'Neste kamp' }}</span>
      </span>
    </div>

    <span class="next-match__opponent">{{ event.opponent }}</span>
    <span class="next-match__detail">{{ detailLine }}</span>
    </div>

    <img
      class="next-match__illo"
      src="/illustrations/bench-boss-state-icons/512/upcoming-match-transparent.png"
      alt=""
      width="88"
      height="88"
      decoding="async"
    />
    </div>

    <!-- Utenfor tekstkolonnen: mangelen gjelder hele kampen, ikke bare
         teksten, og får da hele kortets bredde i stedet for å brekke mot
         bildet. -->
    <span v-if="missing.length" class="next-match__missing">
      <span class="next-match__missing-dot" aria-hidden="true"></span>
      <span>Mangler {{ missingLine }}</span>
    </span>
  </router-link>
</template>

<style scoped>
/* Kortet er skjermens viktigste, og hadde ingenting som skilte det fra
   resten. Illustrasjonen ligger som en egen kolonne — ikke bak teksten:
   den er tegnet med farge og dybde, og bak tekst blir den grumsete. */
.next-match {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--ds-space-lg);
  text-decoration: none;
}

/* Tekst og bilde side om side; mangel-linja under, i full bredde. */
.next-match__row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--ds-space-md);
}

.next-match__body {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  flex: 1;
  min-width: 0;
}

.next-match__illo {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  object-fit: contain;
}

/* Under 380px stjeler bildet for mye fra motstandernavnet. */
@media (max-width: 379px) {
  .next-match__illo { width: 56px; height: 56px; }
}

.next-match__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  margin-bottom: 2px;
}

.next-match__tags {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.next-match__team-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--ds-radius-sm);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.next-match__team-tag--gronn { background: var(--ds-team-gronn-bg); color: var(--ds-team-gronn); }
.next-match__team-tag--rod   { background: var(--ds-team-rod-bg);   color: var(--ds-team-rod); }
.next-match__team-tag--hvit  { background: var(--ds-team-hvit-bg);  color: var(--ds-team-hvit); border: 1px solid var(--ds-team-hvit-border); }
.next-match__team-tag--cup   { background: var(--ds-color-bg-subtle); color: var(--ds-color-text-secondary); }

.next-match__kicker {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  white-space: nowrap;
}

.next-match__opponent {
  font-family: var(--ds-font-heading);
  font-size: var(--ds-text-xl);
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: var(--ds-color-text-primary);
}

.next-match__detail {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
}

/* Identisk med kampdag-kortets venue-merkelapp — samme opplysning, samme form. */
.next-match__venue {
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: var(--ds-radius-sm);
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-tertiary);
  letter-spacing: 0.02em;
}

/* Det som står igjen. Prikk + tekst — samme språk som påminnelsene i «Å ordne»,
   ikke en ny pille. En fylt pille inne i et kort som allerede har bakgrunn og
   ramme blir en boks i en boks, og `radius-full` gir en kapsel som ser knekt
   ut i det linja brytes.
   Dempet varm, ikke rødt: dette er noe å gjøre, ikke noe som ryker. */
.next-match__missing {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  /* Ingen margin-top: kolonnen har allerede gap. To lag luft ble dobbelt. */
  /* xs, ikke sm: dette er en merknad på kampen, ikke overskriften. I sm brakk
     linja i to og slo motstandernavnet i vekt. Fargen gjør jobben. */
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  line-height: 1.4;
  letter-spacing: -0.005em;
  color: var(--ds-color-warm-text);
}

/* Prikken sitter på FØRSTE linje, ikke midt i en tolinjes blokk. */
.next-match__missing-dot {
  width: 6px;
  height: 6px;
  margin-top: 5px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--ds-color-warm);
  box-shadow: 0 0 0 3px rgba(185, 96, 63, 0.16);
}

/* Smal skjerm: kortene med bildekolonne har bare ~200px til teksten når
   padding er lg. Da brekker «Onsdag 19 aug · 18:00» midt i. Strammere ramme
   gir 16px tilbake til innholdet — samme regel for alle tre, så de ikke
   begynner å oppføre seg ulikt igjen. */
@media (max-width: 360px) {
  .next-match { padding: var(--ds-space-md); }
}
</style>
