<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCups } from '../composables/useCups'
import { useCupMatches } from '../composables/useCupMatches'
import { useCupTeams } from '../composables/useCupTeams'
import { useToast } from '../composables/useToast'
import { useAuth } from '../stores/auth'
import { parseCupMatchFile, fordelLag } from '../lib/cupExcel'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Sheet from '../components/Sheet.vue'

// Turneringene settes opp her, og brukes på /cup. Samme skille som
// /admin/sesong-kamper har mot /kamper: én flate redigerer, én flate leses.
//
// Fram til nå fantes ingen av delene. Cupene ble seedet med SQL, og en trener
// uten serie — G6, G7, G8 har ingen terminliste i FIKS i det hele tatt — kunne
// ikke legge inn det eneste laget hans faktisk spiller.

const { cups, activeCup, fetchCups, createCup, updateCup, deleteCup, selectCup } = useCups()
const { cupMatches, fetchCupMatches, addCupMatch, bulkAddCupMatches, deleteCupMatch } = useCupMatches()
const { cupTeams } = useCupTeams()
const { show: showToast } = useToast()
const { activeCohort } = useAuth()

const ready = ref(false)
const lagrer = ref(false)

onMounted(async () => {
  await fetchCups()
  if (activeCup.value) await fetchCupMatches(activeCup.value.id)
  ready.value = true
})

// ---- Ny turnering ----
const visNyCup = ref(false)
const nyCup = ref(tomCup())

function tomCup() {
  // Ett lag er normalen. Melder klubben på to, legger han til raden selv —
  // fire tomme felter for noe de fleste ikke trenger er verre enn ett klikk.
  return { name: '', venue: '', start_date: '', end_date: '', teams: [''] }
}

const kanLagreCup = computed(() =>
  nyCup.value.name.trim().length > 0 && nyCup.value.teams.some(t => t.trim())
)

function leggTilLagFelt() {
  if (nyCup.value.teams.length < 4) nyCup.value.teams.push('')
}

function fjernLagFelt(i) {
  nyCup.value.teams.splice(i, 1)
}

async function lagreNyCup() {
  if (!kanLagreCup.value || lagrer.value) return
  lagrer.value = true
  const cup = await createCup({
    ...nyCup.value,
    teams: nyCup.value.teams.map(t => t.trim()).filter(Boolean)
  })
  lagrer.value = false

  if (!cup) { showToast('Turneringen ble ikke lagret', 'error'); return }

  await fetchCupMatches(cup.id)
  visNyCup.value = false
  nyCup.value = tomCup()
  showToast('Turneringen er lagt inn', 'success')
}

// ---- Bytte hvilken cup man ser på ----
async function velgCup(id) {
  if (activeCup.value?.id === id) return
  selectCup(id)
  await fetchCupMatches(id)
}

// ---- Ny kamp ----
const visNyKamp = ref(false)
const nyKamp = ref(tomKamp())

function tomKamp() {
  return { our_team: '', opponent: '', match_date: '', match_time: '', pitch: '', round: '' }
}

function apneNyKamp() {
  nyKamp.value = tomKamp()
  // Med ett lag er det ingenting å velge — da er valget tatt.
  if (cupTeams.value.length) nyKamp.value.our_team = cupTeams.value[0].slug
  // Datoen er nesten alltid cupens første dag.
  if (activeCup.value?.start_date) nyKamp.value.match_date = activeCup.value.start_date
  visNyKamp.value = true
}

const kanLagreKamp = computed(() =>
  !!nyKamp.value.our_team && nyKamp.value.opponent.trim().length > 0 && !!nyKamp.value.match_date
)

async function lagreNyKamp() {
  if (!kanLagreKamp.value || lagrer.value || !activeCup.value) return
  lagrer.value = true
  const kamp = await addCupMatch(activeCup.value.id, nyKamp.value)
  lagrer.value = false

  if (!kamp) { showToast('Kampen ble ikke lagret', 'error'); return }

  // Skjemaet blir stående med lag og dato: man legger inn seks kamper på rad,
  // ikke én. Bare motstander, tid og bane nullstilles.
  nyKamp.value = { ...nyKamp.value, opponent: '', match_time: '', pitch: '', round: '' }
  showToast('Kampen er lagt til', 'success')
}

// ---- Importer kampoppsettet fra regneark ----
//
// Arrangøren sender et regneark. Å skrive av tolv kamper for hånd er den
// jobben serien slapp for lenge siden — parseren er den samme, bare med
// arrangørens kolonnenavn og uten en terminliste å pare mot.
const filInput = ref(null)
const drar = ref(false)
const leser = ref(false)
const visImport = ref(false)
const importRader = ref([])

const usikre = computed(() => importRader.value.filter(r => !r.sikker).length)

function onDragOver(e) { e.preventDefault(); drar.value = true }
function onDragLeave() { drar.value = false }
async function onDrop(e) {
  e.preventDefault(); drar.value = false
  const fil = e.dataTransfer?.files?.[0]
  if (fil) await lesFil(fil)
}
async function onFilValgt(e) {
  const fil = e.target.files?.[0]
  if (fil) await lesFil(fil)
  e.target.value = ''
}

async function lesFil(fil) {
  if (!activeCup.value) return
  leser.value = true
  try {
    const rader = await parseCupMatchFile(fil)
    if (!rader.length) {
      showToast('Fant ingen kamper i filen', 'error')
      return
    }
    importRader.value = fordelLag(rader, {
      klubbKortnavn: activeCohort.value?.club_short_name || activeCohort.value?.club_name || '',
      cupLag: cupTeams.value
    })
    visImport.value = true
  } catch (e) {
    showToast(e?.message || 'Kunne ikke lese filen', 'error')
  } finally {
    leser.value = false
  }
}

// Gjettet skal kunne rettes FØR noe lagres. Trykk på laget for å bytte.
function bytteLag(i) {
  const rad = importRader.value[i]
  const n = cupTeams.value.findIndex(t => t.slug === rad.our_team)
  const neste = cupTeams.value[(n + 1) % cupTeams.value.length]
  if (!neste) return
  importRader.value[i] = { ...rad, our_team: neste.slug, sikker: true }
}

async function lagreImport() {
  if (!activeCup.value || lagrer.value || !importRader.value.length) return
  lagrer.value = true
  try {
    const n = await bulkAddCupMatches(activeCup.value.id, importRader.value)
    visImport.value = false
    importRader.value = []
    showToast(`${n} ${n === 1 ? 'kamp' : 'kamper'} importert`, 'success')
  } catch (e) {
    showToast(e?.message || 'Importen feilet — ingenting ble lagret', 'error')
  } finally {
    lagrer.value = false
  }
}

// ---- Slette ----
const kampTilSletting = ref(null)
const cupTilSletting = ref(null)

async function bekreftSlettKamp() {
  const id = kampTilSletting.value?.id
  kampTilSletting.value = null
  if (!id) return
  const slettet = await deleteCupMatch(id)
  showToast(slettet ? 'Kampen er slettet' : 'Kampen ble ikke slettet', slettet ? 'success' : 'error')
}

async function bekreftSlettCup() {
  const cup = cupTilSletting.value
  cupTilSletting.value = null
  if (!cup) return
  if (!await deleteCup(cup.id)) { showToast('Turneringen ble ikke slettet', 'error'); return }
  if (activeCup.value) await fetchCupMatches(activeCup.value.id)
  showToast('Turneringen er slettet', 'success')
}

// ---- Status ----
async function settStatus(status) {
  if (!activeCup.value) return
  const oppdatert = await updateCup(activeCup.value.id, { status })
  showToast(
    oppdatert ? (status === 'completed' ? 'Turneringen er avsluttet' : 'Turneringen er åpnet igjen') : 'Statusen ble ikke endret',
    oppdatert ? 'success' : 'error'
  )
}

// ---- Visning ----
function datoLinje(cup) {
  if (!cup?.start_date) return 'Uten dato'
  const f = d => new Date(d + 'T00:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
  return cup.end_date && cup.end_date !== cup.start_date
    ? `${f(cup.start_date)}–${f(cup.end_date)}`
    : f(cup.start_date)
}

function kampDato(m) {
  if (!m.match_date) return 'Dato kommer'
  const d = new Date(m.match_date + 'T00:00:00').toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })
  return m.match_time ? `${d} · ${m.match_time.slice(0, 5)}` : d
}

function lagNavn(slug) {
  return cupTeams.value.find(t => t.slug === slug)?.name || slug
}

const sorterteKamper = computed(() =>
  [...cupMatches.value].sort((a, b) =>
    (a.match_date || '9999').localeCompare(b.match_date || '9999') ||
    (a.match_time || '').localeCompare(b.match_time || ''))
)
</script>

<template>
  <div class="desktop-container">
    <div class="page-header">
      <h1 class="page-header__title">Turneringer</h1>
      <p class="page-header__subtitle">Legg inn cuper laget spiller</p>
    </div>

    <div class="px-lg">
      <button class="ds-btn ds-btn--primary turn-ny" @click="visNyCup = true">Ny turnering</button>

      <p v-if="!ready" class="turn-muted">Henter turneringer …</p>

      <div v-else-if="!cups.length" class="ds-empty">
        <img src="/illustrations/bench-boss-feature-icons/512/cup-tournament-transparent.png" alt="" class="ds-empty__illo" />
        <h3 class="ds-empty__title">Ingen turneringer ennå</h3>
        <p class="ds-empty__description">
          Legg inn cupen med lagene dere stiller med, så kan du fordele troppen og
          føre kampene underveis.
        </p>
      </div>

      <template v-else>
        <!-- Flere cuper: velg hvilken du jobber med. Én cup trenger ingen velger. -->
        <div v-if="cups.length > 1" class="turn-velger" role="tablist">
          <button
            v-for="c in cups"
            :key="c.id"
            type="button"
            class="turn-velger__knapp"
            :class="{ 'turn-velger__knapp--valgt': activeCup?.id === c.id }"
            role="tab"
            :aria-selected="activeCup?.id === c.id"
            @click="velgCup(c.id)"
          >{{ c.name }}</button>
        </div>

        <section v-if="activeCup" class="ds-card turn-kort">
          <div class="turn-kort__hode">
            <div>
              <h2 class="turn-kort__navn">{{ activeCup.name }}</h2>
              <p class="turn-kort__meta">
                {{ datoLinje(activeCup) }}<template v-if="activeCup.venue"> · {{ activeCup.venue }}</template>
              </p>
            </div>
            <span class="turn-merke" :class="`turn-merke--${activeCup.status}`">
              {{ activeCup.status === 'completed' ? 'Avsluttet' : 'Aktiv' }}
            </span>
          </div>

          <p v-if="cupTeams.length" class="turn-lag">
            <span v-for="t in cupTeams" :key="t.slug" class="turn-lag__merke">{{ t.name }}</span>
          </p>

          <div class="turn-kort__handlinger">
            <button
              class="ds-btn ds-btn--secondary"
              @click="settStatus(activeCup.status === 'completed' ? 'active' : 'completed')"
            >{{ activeCup.status === 'completed' ? 'Åpne igjen' : 'Avslutt' }}</button>
            <button class="turn-slett" @click="cupTilSletting = activeCup">Slett turneringen</button>
          </div>
        </section>

        <section v-if="activeCup" class="turn-kamper">
          <div class="turn-kamper__hode">
            <h2 class="hjem-section-kicker">Kampprogram</h2>
            <button class="ds-btn ds-btn--secondary ds-btn--sm" @click="apneNyKamp">Legg til kamp</button>
          </div>

          <!-- Importen bor i den tomme tilstanden. Har programmet først
               kamper, er «Legg til kamp» veien — en import oppå det som
               allerede står ville laget duplikater ingen ba om. -->
          <template v-if="!sorterteKamper.length">
          <div
            class="turn-slipp"
            :class="{ 'turn-slipp--aktiv': drar }"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
            @click="filInput?.click()"
          >
            <p class="turn-slipp__tittel">{{ leser ? 'Leser filen …' : 'Har du kampoppsettet i et regneark?' }}</p>
            <p class="turn-slipp__hint">Dra fila hit, eller tap for å velge. .xlsx, .xls og .csv.</p>
          </div>
          <p class="turn-muted">Eller legg dem inn én og én med «Legg til kamp».</p>
          <input ref="filInput" type="file" accept=".xlsx,.xls,.csv" style="display:none" @change="onFilValgt" />
          </template>

          <ul v-else class="turn-liste">
            <li v-for="m in sorterteKamper" :key="m.id" class="turn-rad">
              <div class="turn-rad__tekst">
                <span class="turn-rad__topp">{{ kampDato(m) }}</span>
                <span class="turn-rad__hoved">{{ lagNavn(m.our_team) }} mot {{ m.opponent || 'TBD' }}</span>
                <span v-if="m.pitch || m.round" class="turn-rad__bunn">
                  {{ [m.pitch, m.round].filter(Boolean).join(' · ') }}
                </span>
              </div>
              <button class="turn-slett" @click="kampTilSletting = m">Slett</button>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <Sheet :show="visNyCup" title="Ny turnering" @close="visNyCup = false">
      <div class="ds-form-group">
        <label class="ds-label" for="cup-navn">Navn</label>
        <input id="cup-navn" v-model="nyCup.name" class="ds-input" placeholder="f.eks. Sandarcupen" />
      </div>
      <div class="ds-form-group">
        <label class="ds-label ds-label--optional" for="cup-sted">Sted</label>
        <input id="cup-sted" v-model="nyCup.venue" class="ds-input" placeholder="f.eks. Virik Idrettspark" />
      </div>
      <div class="ds-form-row">
        <div class="ds-form-group">
          <label class="ds-label" for="cup-fra">Fra</label>
          <input id="cup-fra" v-model="nyCup.start_date" type="date" class="ds-input" />
        </div>
        <div class="ds-form-group">
          <label class="ds-label ds-label--optional" for="cup-til">Til</label>
          <input id="cup-til" v-model="nyCup.end_date" type="date" class="ds-input" />
        </div>
      </div>

      <div class="ds-form-group">
        <label class="ds-label" for="cup-lag-0">Lag dere stiller med</label>
        <div v-for="(_, i) in nyCup.teams" :key="i" class="turn-lagfelt">
          <input :id="`cup-lag-${i}`" v-model="nyCup.teams[i]" class="ds-input" :placeholder="i === 0 ? 'f.eks. Blå' : 'f.eks. Rød'" />
          <button v-if="nyCup.teams.length > 1" type="button" class="turn-slett" @click="fjernLagFelt(i)">Fjern</button>
        </div>
        <button v-if="nyCup.teams.length < 4" type="button" class="turn-legg-til" @click="leggTilLagFelt">
          Legg til lag
        </button>
        <p class="turn-hint">Lagene er det du fordeler troppen på. Ett lag er nok.</p>
      </div>

      <div class="sheet-actions">
        <button class="ds-btn ds-btn--secondary" @click="visNyCup = false">Avbryt</button>
        <button class="ds-btn ds-btn--primary" :disabled="!kanLagreCup || lagrer" @click="lagreNyCup">
          {{ lagrer ? 'Lagrer …' : 'Opprett' }}
        </button>
      </div>
    </Sheet>

    <Sheet :show="visNyKamp" title="Ny kamp" @close="visNyKamp = false">
      <div v-if="cupTeams.length > 1" class="ds-form-group">
        <label class="ds-label">Vårt lag</label>
        <div class="turn-lagvalg" role="radiogroup">
          <button
            v-for="t in cupTeams"
            :key="t.slug"
            type="button"
            class="turn-lagvalg__knapp"
            :class="{ 'turn-lagvalg__knapp--valgt': nyKamp.our_team === t.slug }"
            role="radio"
            :aria-checked="nyKamp.our_team === t.slug"
            @click="nyKamp.our_team = t.slug"
          >{{ t.name }}</button>
        </div>
      </div>

      <div class="ds-form-group">
        <label class="ds-label" for="kamp-motstander">Motstander</label>
        <input id="kamp-motstander" v-model="nyKamp.opponent" class="ds-input" placeholder="f.eks. Ready Blå" />
      </div>
      <div class="ds-form-row">
        <div class="ds-form-group">
          <label class="ds-label" for="kamp-dato">Dato</label>
          <input id="kamp-dato" v-model="nyKamp.match_date" type="date" class="ds-input" />
        </div>
        <div class="ds-form-group">
          <label class="ds-label ds-label--optional" for="kamp-tid">Tid</label>
          <input id="kamp-tid" v-model="nyKamp.match_time" type="time" class="ds-input" />
        </div>
      </div>
      <div class="ds-form-row">
        <div class="ds-form-group">
          <label class="ds-label ds-label--optional" for="kamp-bane">Bane</label>
          <input id="kamp-bane" v-model="nyKamp.pitch" class="ds-input" placeholder="f.eks. Virik 3" />
        </div>
        <div class="ds-form-group">
          <label class="ds-label ds-label--optional" for="kamp-nummer">Kampnummer</label>
          <input id="kamp-nummer" v-model="nyKamp.round" class="ds-input" placeholder="f.eks. Kamp 436" />
        </div>
      </div>

      <div class="sheet-actions">
        <button class="ds-btn ds-btn--secondary" @click="visNyKamp = false">Ferdig</button>
        <button class="ds-btn ds-btn--primary" :disabled="!kanLagreKamp || lagrer" @click="lagreNyKamp">
          {{ lagrer ? 'Lagrer …' : 'Legg til' }}
        </button>
      </div>
    </Sheet>

    <Sheet :show="visImport" title="Kamper fra regnearket" @close="visImport = false">
      <p class="turn-hint turn-hint--topp">
        {{ importRader.length }} {{ importRader.length === 1 ? 'kamp' : 'kamper' }} funnet.
        <template v-if="usikre">
          {{ usikre }} av dem vet vi ikke hvilket lag tilhører — trykk på laget for å rette.
        </template>
        <template v-else-if="cupTeams.length > 1">Trykk på laget for å bytte.</template>
      </p>

      <ul class="turn-import">
        <li v-for="(r, i) in importRader" :key="i" class="turn-import__rad" :class="{ 'turn-import__rad--gjett': !r.sikker }">
          <button type="button" class="turn-import__lag" @click="bytteLag(i)">{{ lagNavn(r.our_team) }}</button>
          <span class="turn-import__tekst">
            <span class="turn-import__hoved">mot {{ r.opponent || 'TBD' }}</span>
            <span class="turn-import__meta">
              {{ kampDato(r) }}<template v-if="r.pitch"> · {{ r.pitch }}</template>
            </span>
            <span v-if="!r.sikker" class="turn-import__raa">Sto i fila: {{ r.raw }}</span>
          </span>
        </li>
      </ul>

      <div class="sheet-actions">
        <button class="ds-btn ds-btn--secondary" @click="visImport = false">Avbryt</button>
        <button class="ds-btn ds-btn--primary" :disabled="lagrer" @click="lagreImport">
          {{ lagrer ? 'Importerer …' : `Importer ${importRader.length}` }}
        </button>
      </div>
    </Sheet>

    <ConfirmDialog
      :show="!!kampTilSletting"
      title="Slette kampen?"
      :message="kampTilSletting ? `${lagNavn(kampTilSletting.our_team)} mot ${kampTilSletting.opponent || 'TBD'}` : ''"
      confirm-label="Slett"
      @confirm="bekreftSlettKamp"
      @cancel="kampTilSletting = null"
    />

    <ConfirmDialog
      :show="!!cupTilSletting"
      title="Slette turneringen?"
      message="Kampene og lagfordelingen i turneringen slettes også. Dette kan ikke angres."
      confirm-label="Slett"
      @confirm="bekreftSlettCup"
      @cancel="cupTilSletting = null"
    />
  </div>
</template>

<style scoped>
.turn-slipp {
  border: 1px dashed var(--ds-color-border-strong);
  border-radius: var(--ds-radius-lg);
  padding: var(--ds-space-xl) var(--ds-space-lg);
  text-align: center;
  cursor: pointer;
  background: var(--ds-color-bg);
  margin-top: var(--ds-space-sm);
}

.turn-slipp--aktiv {
  border-color: var(--ds-color-accent);
  background: var(--ds-color-bg-subtle);
}

.turn-slipp__tittel { margin: 0; font-weight: 600; }
.turn-slipp__hint {
  margin: 6px 0 0;
  color: var(--ds-color-text-secondary);
  font-size: var(--ds-text-sm);
}

.turn-import {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 46vh;
  overflow-y: auto;
}

.turn-import__rad {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-sm) 0;
  border-bottom: 1px solid var(--ds-color-border-light);
}

.turn-import__lag {
  flex: none;
  border: 1px solid var(--ds-color-border);
  background: var(--ds-color-bg);
  border-radius: var(--ds-radius-full);
  padding: 4px 12px;
  font-size: var(--ds-text-xs);
  font-weight: 600;
  cursor: pointer;
}

.turn-import__rad--gjett .turn-import__lag {
  border-color: var(--ds-color-warning);
  background: var(--ds-color-warning-light);
  color: var(--ds-color-warning-text);
}

.turn-import__tekst {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.turn-import__hoved { font-size: var(--ds-text-sm); }
.turn-import__meta,
.turn-import__raa {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
}
.turn-import__raa { color: var(--ds-color-warning-text); }

.turn-hint--topp { margin-bottom: var(--ds-space-md); }

/* .sheet-actions er ikke i design-systemet — hvert view som bruker Sheet
   definerer den selv. Samme verdier som AdminSesongKamperView. */
.sheet-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: var(--ds-space-lg);
}

.turn-lagvalg {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-xs);
}

.turn-lagvalg__knapp {
  border: 1px solid var(--ds-color-border);
  background: var(--ds-color-bg);
  color: var(--ds-color-text-secondary);
  border-radius: var(--ds-radius-full);
  padding: 8px 16px;
  font-size: var(--ds-text-sm);
  cursor: pointer;
}

.turn-lagvalg__knapp--valgt {
  border-color: var(--ds-color-accent);
  background: var(--ds-color-accent);
  color: var(--ds-color-accent-text);
  font-weight: 600;
}

.turn-ny {
  width: 100%;
  margin-bottom: var(--ds-space-lg);
}

.turn-muted {
  color: var(--ds-color-text-secondary);
  font-size: var(--ds-text-sm);
  padding: var(--ds-space-md) 0;
}

.turn-velger {
  display: flex;
  gap: var(--ds-space-xs);
  flex-wrap: wrap;
  margin-bottom: var(--ds-space-md);
}

.turn-velger__knapp {
  border: 1px solid var(--ds-color-border);
  background: var(--ds-color-bg);
  color: var(--ds-color-text-secondary);
  border-radius: var(--ds-radius-full);
  padding: 6px 14px;
  font-size: var(--ds-text-sm);
  cursor: pointer;
}

.turn-velger__knapp--valgt {
  border-color: var(--ds-color-text-primary);
  color: var(--ds-color-text-primary);
  font-weight: 600;
}

.turn-kort {
  padding: var(--ds-space-lg);
}

.turn-kort__hode {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ds-space-md);
}

.turn-kort__navn {
  margin: 0;
  font-size: var(--ds-text-lg);
  font-weight: 700;
}

.turn-kort__meta {
  margin: 4px 0 0;
  color: var(--ds-color-text-secondary);
  font-size: var(--ds-text-sm);
}

.turn-merke {
  flex: none;
  font-size: var(--ds-text-xs);
  padding: 4px 10px;
  border-radius: var(--ds-radius-full);
  border: 1px solid var(--ds-color-border);
  color: var(--ds-color-text-secondary);
}

.turn-merke--active {
  border-color: var(--ds-color-text-primary);
  color: var(--ds-color-text-primary);
}

.turn-lag {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-xs);
  margin: var(--ds-space-md) 0 0;
}

.turn-lag__merke {
  font-size: var(--ds-text-xs);
  padding: 4px 10px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-bg-subtle);
  border: 1px solid var(--ds-color-border);
}

.turn-kort__handlinger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  margin-top: var(--ds-space-lg);
}

.turn-kamper {
  margin-top: var(--ds-space-xl);
}

.turn-kamper__hode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
}

.turn-liste {
  list-style: none;
  margin: var(--ds-space-sm) 0 0;
  padding: 0;
}

.turn-rad {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  padding: var(--ds-space-md) 0;
  border-bottom: 1px solid var(--ds-color-border);
}

.turn-rad__tekst {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.turn-rad__topp,
.turn-rad__bunn {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-secondary);
}

.turn-rad__hoved {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.turn-slett {
  flex: none;
  background: none;
  border: none;
  padding: 4px;
  color: var(--ds-color-error);
  font-size: var(--ds-text-sm);
  cursor: pointer;
}

.turn-lagfelt {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-sm);
}

.turn-legg-til {
  background: none;
  border: none;
  padding: 4px 0;
  color: var(--ds-color-text-primary);
  font-size: var(--ds-text-sm);
  text-decoration: underline;
  cursor: pointer;
}

.turn-hint {
  margin: var(--ds-space-xs) 0 0;
  color: var(--ds-color-text-secondary);
  font-size: var(--ds-text-xs);
}
</style>
