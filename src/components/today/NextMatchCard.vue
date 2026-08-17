<script setup>
import { computed } from 'vue'
import { relativeDateLabel, daysUntil } from '../../lib/dateLabels'
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
  if (!p.squad) out.push('tropp')
  if (!p.lineup) out.push('oppstilling')
  return out
})

// «dommer og tropp og oppstilling» er ikke norsk. Komma til det siste leddet.
const missingLine = computed(() => {
  const m = missing.value
  if (m.length < 2) return m[0] || ''
  return `${m.slice(0, -1).join(', ')} og ${m[m.length - 1]}`
})


const detailLine = computed(() => {
  const d = new Date(props.event.date + 'T12:00:00')
  const t = (props.event.time || '').slice(0, 5)
  // Samme format som radene under («Man 17 aug · 18:00 · borte») — to ulike
  // datoformater rett over hverandre er halve grunnen til at flaten ser
  // ustelt ut.
  const day = relativeDateLabel(props.event.date)
  // Datoen er overflødig når kampen er denne uka — «Onsdag» er mer presist
  // for en trener enn «19. aug». Den kommer tilbake så snart ukedagen alene
  // ikke lenger peker entydig.
  // nb-NO gir «19. aug.» — punktumet bak måneden finnes ikke i radene under.
  const far = daysUntil(props.event.date) > 7
  const dm = d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }).replace(/\.$/, '')
  const parts = [far ? `${day} ${dm}` : day]
  if (t && t !== '00:00') parts.push(t)
  const where = props.event.type === 'cup'
    ? props.event.pitch
    : (props.event.isHome ? 'hjemme' : 'borte')
  if (where) parts.push(where)
  return parts.join(' · ')
})
</script>

<template>
  <router-link :to="event.to" class="ds-card ds-card--interactive next-match">
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
        <span class="next-match__kicker">{{ event.type === 'cup' ? 'Neste cupkamp' : 'Neste kamp' }}</span>
      </span>
    </div>

    <span class="next-match__opponent">{{ event.opponent }}</span>
    <span class="next-match__detail">{{ detailLine }}</span>

    <span v-if="missing.length" class="next-match__missing">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12" y2="16.6"/></svg>
      Mangler {{ missingLine }}
    </span>
    </div>

    <img
      class="next-match__illo"
      src="/illustrations/bench-boss-state-icons/512/upcoming-match-transparent.png"
      alt=""
      width="88"
      height="88"
      decoding="async"
    />
  </router-link>
</template>

<style scoped>
/* Kortet er skjermens viktigste, og hadde ingenting som skilte det fra
   resten. Illustrasjonen ligger som en egen kolonne — ikke bak teksten:
   den er tegnet med farge og dybde, og bak tekst blir den grumsete. */
.next-match {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--ds-space-md);
  padding: var(--ds-space-lg);
  text-decoration: none;
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

/* Det som står igjen. Dempet varm, ikke rødt: dette er noe å gjøre, ikke
   noe som ryker. Rødt er reservert for dommer på kampdag. */
.next-match__missing {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  margin-top: 8px;
  padding: 3px 9px 3px 7px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-warm-bg, #F8E8E0);
  color: var(--ds-color-warm-text, #7A3A24);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  line-height: 1.3;
}

.next-match__missing svg { width: 13px; height: 13px; flex-shrink: 0; }
</style>
