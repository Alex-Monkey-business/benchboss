<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useFiks } from '../composables/useFiks'
import { useSeasons } from '../composables/useSeasons'
import { useSeasonTeams } from '../composables/useSeasonTeams'
import { useToast } from '../composables/useToast'
import { clubLogo, teamAge, genderFromCohortName } from '../lib/fiks'

// Første møte med et tomt kull. Fullskjerm, ett spørsmål av gangen, og
// svarene hentes fra FIKS i stedet for å skrives inn.
//
// Klubb → årgang → hvilke av lagene er dine. Ut kommer lagene med navn og
// farge, og hele terminlista. Det treneren står igjen med er spillere,
// trenere og treninger — de tre tingene fotball.no ikke vet noe om.

const router = useRouter()
const { activeCohort, refreshMember, coach } = useAuth()
const { activeSeason, createSeason, fetchSeasons } = useSeasons()
const { seasonTeams } = useSeasonTeams()
const { show: showToast } = useToast()
const {
  searching, searchClubs, fetchClubTeams, linkClub, setBirthYear,
  createTeams, linkSelfToTeams, importMatches, ageClass, teamsForAge, shortTeamName
} = useFiks()

const NAA = new Date().getFullYear()

const steg = ref('velkommen')
const laster = ref(false)
const feil = ref('')

// ---------------------------------------------------------------- Klubb
const sok = ref('')
const treff = ref([])
const klubb = ref(null)          // { fiksId, name, district, teams[] }
let sokTimer = null

// Er klubben allerede koblet, er spørsmålet besvart for godt — også for
// kull nr. 2 i samme klubb.
onMounted(async () => {
  await fetchSeasons()
  const koblet = activeCohort.value?.club_fiks_id
  if (!koblet) return

  // Steget byttes FØRST når lagene er inne. Sto det på 'argang' mens
  // hentingen pågikk, kunne man velge årgang mens klubben ennå var tom —
  // og «ingen lag i klassen» var da et svar på et spørsmål som ikke var
  // stilt ferdig.
  // Hentes i bakgrunnen mens velkomsten står. Er den ferdig når han trykker,
  // hopper vi rett til årgang.
  try {
    klubb.value = {
      fiksId: String(koblet),
      name: activeCohort.value?.club_name || '',
      teams: await fetchClubTeams(koblet)
    }
  } catch {
    klubb.value = null
  }
})

// Velkomstskjermen er ett trykk, ikke et steg med et spørsmål i seg. Den
// finnes for å si hva som skal skje — at lagene og kampene hentes, og at han
// ikke skal skrive inn noe. Det er der aha-en ligger, ikke i en overskrift
// som skryter.
const fornavn = computed(() => (coach.value?.name || '').split(' ')[0])

function start() {
  steg.value = klubb.value ? 'argang' : 'klubb'
}

watch(sok, q => {
  clearTimeout(sokTimer)
  feil.value = ''
  if (q.trim().length < 2) { treff.value = []; return }
  // Ett søk per pause i skrivingen, ikke ett per tastetrykk.
  sokTimer = setTimeout(async () => {
    try {
      treff.value = await searchClubs(q)
    } catch {
      feil.value = 'Fikk ikke kontakt med fotball.no.'
    }
  }, 350)
})

onUnmounted(() => clearTimeout(sokTimer))

async function velgKlubb(c) {
  klubb.value = c
  steg.value = 'argang'
  try {
    await linkClub(c.fiksId)
    await refreshMember()
  } catch (e) {
    // Koblingen er en bekvemmelighet for neste gang, ikke en forutsetning
    // for denne. Feiler den, går vi videre.
    console.warn('Kunne ikke lagre klubbkoblingen:', e?.message)
  }
}

// -------------------------------------------------------------- Årgang
const argang = ref(activeCohort.value?.birth_year || null)

// Fra 5- til 19-åringer. Nyeste årgang først — det er de nye lagene som
// opprettes oftest.
const argangValg = computed(() => {
  const out = []
  for (let y = NAA - 5; y >= NAA - 19; y--) out.push(y)
  return out
})

const alder = computed(() => ageClass(argang.value, NAA))

const lagIKlassen = computed(() =>
  klubb.value ? teamsForAge(klubb.value.teams, alder.value) : []
)

// Aldersklassen gir både G og J. Bare det ene settet er dette kullets lag.
const lagForKjonn = computed(() =>
  lagIKlassen.value.filter(t => teamAge(t.name)?.gender === kjonn.value)
)

// Et kull har som regel ALLE lagene sine i samme klasse — Halsen G2015 er
// Grønn, Hvit og Rød, ikke ett av dem. Så lagene er huket av på forhånd, og
// steg 3 er en bekreftelse, ikke en oppgave. Å ta bort er sjeldenheten.
//
// Kjønnet er unntaket som gjør at vi ikke bare kan ta alle: 8-åringene i Stag
// er både G8 og J8, og bare det ene settet hører til dette kullet.
// Kjønnet er et eget valg, ikke en gjetning. Kullnavnet («Stag G2018») gir
// startverdien, men den står synlig og kan byttes — en G i et navn er en
// forkortelse, ikke en garanti.
const kjonn = ref(genderFromCohortName(activeCohort.value?.name) || 'G')

function forhandsvalg() {
  valgte.value = new Set(lagForKjonn.value.map(t => t.fiksId))
}

async function bekreftArgang() {
  if (!argang.value) return
  try {
    await setBirthYear(argang.value)
    await refreshMember()
  } catch (e) {
    feil.value = e?.message || 'Kunne ikke lagre årgangen'
    return
  }
  forhandsvalg()
  steg.value = 'lag'
}

// ----------------------------------------------------------------- Lag
const valgte = ref(new Set())
const viserAlle = ref(false)

const lagVises = computed(() =>
  viserAlle.value ? (klubb.value?.teams || []) : lagForKjonn.value
)

// Fant vi ingen lag i klassen, SIER vi det. Å svare med alle 43 lagene i
// klubben er ikke hjelpsomt — det er å be treneren gjøre jobben selv, i en
// lengre liste. Hele lista ligger bak lenka under, for den som vil ha den.
//
// Bytter man årgang, gjelder ikke det valget lenger.
watch([argang, kjonn], () => { viserAlle.value = false; valgte.value = new Set() })
// Utvider man til hele klubben, er ingenting forhåndsvalgt — der VET vi ikke.
watch(viserAlle, v => { if (v) valgte.value = new Set() })

function toggle(t) {
  const s = new Set(valgte.value)
  s.has(t.fiksId) ? s.delete(t.fiksId) : s.add(t.fiksId)
  valgte.value = s
}

const valgteLag = computed(() => lagVises.value.filter(t => valgte.value.has(t.fiksId)))

const kortNavn = t => shortTeamName(t.name, activeCohort.value?.club_name?.split(' ')[0] || '')

// ------------------------------------------------------------ Henting
const henter = ref(false)
const resultat = ref(null)

async function hent() {
  if (!valgteLag.value.length) return
  henter.value = true
  feil.value = ''
  steg.value = 'henter'
  try {
    const opprettede = await createTeams(valgteLag.value)

    let sesong = activeSeason.value
    if (!sesong) {
      sesong = await createSeason(`${new Date().getMonth() >= 6 ? 'Høst' : 'Vår'} ${NAA}`)
      await fetchSeasons()
    }

    // Koblingen må skje FØR kampene importeres: bulkAddMatches setter
    // standard-trenere ut fra hvem som har laget, og leser den koblingen der
    // og da. Etterpå ville de 52 kampene stått uten trener.
    if (sesong) await linkSelfToTeams(opprettede, sesong.id)

    // Terminlista dekker hele året. Kamper som alt er spilt hører til forrige
    // sesong, ikke denne — og et tomt kull skal ikke fylles med historikk.
    const fra = `${NAA}-01-01`
    const r = sesong ? await importMatches(sesong.id, { from: fra, teams: opprettede }) : { lagt: 0 }
    resultat.value = { lag: valgteLag.value.length, kamper: r.lagt }
    steg.value = 'ferdig'
  } catch (e) {
    feil.value = e?.message || 'Noe gikk galt under hentingen'
    steg.value = 'lag'
  } finally {
    henter.value = false
  }
}

function ferdig() {
  showToast(`${resultat.value?.lag || 0} lag og ${resultat.value?.kamper || 0} kamper er på plass`, 'success')
  router.replace('/')
}

function hoppOver() {
  // Kullet kan settes opp for hånd på Hjem. Vi husker valget så veiviseren
  // ikke tar over skjermen igjen ved neste innlogging.
  try { localStorage.setItem(`bb_komigang_hoppet_${activeCohort.value?.id}`, '1') } catch { /* privat modus */ }
  router.replace('/')
}
</script>

<template>
  <div class="kig">
    <div class="kig__inner">
      <!-- ---------------------------------------------- Velkommen -->
      <template v-if="steg === 'velkommen'">
        <h1 class="kig__tittel kig__tittel--velkomst">
          Hei{{ fornavn ? ', ' + fornavn : '' }}.
        </h1>
        <p class="kig__velkomst">
          Vi henter lagene dine og hele terminlista fra fotball.no.
          <strong>Du skriver ingenting inn.</strong>
        </p>
        <p class="kig__velkomst kig__velkomst--dempet">
          Tre spørsmål, så er {{ activeCohort?.name || 'kullet' }} satt opp.
        </p>

        <div class="kig__handling">
          <button type="button" class="ds-btn ds-btn--primary kig__hovedknapp" @click="start">
            Kom i gang
          </button>
        </div>
      </template>

      <!-- Klubben er kjent fra før, lagene er på vei. Uten denne sto
           søkefeltet og blinket i et halvsekund før det ble byttet ut. -->
      <template v-else-if="laster">
        <h1 class="kig__tittel">Henter lagene …</h1>
        <p class="kig__lead">{{ activeCohort?.club_name }}</p>
      </template>

      <!-- ------------------------------------------------- Klubb -->
      <template v-else-if="steg === 'klubb'">
        <p class="kig__steg">Steg 1 av 3</p>
        <h1 class="kig__tittel">Hvilken klubb?</h1>
        <!-- Velkomsten har alt sagt at vi henter fra fotball.no. Å gjenta det
             her svekker begge. Her holder det å si hva feltet vil ha. -->
        <p class="kig__lead">Søk opp klubben du trener i.</p>

        <input
          v-model="sok"
          class="ds-input kig__sok"
          type="search"
          autocomplete="off"
          placeholder="Søk etter klubben"
          aria-label="Søk etter klubben"
        />

        <p v-if="searching" class="kig__status">Søker …</p>
        <p v-else-if="feil" class="kig__status kig__status--feil">{{ feil }}</p>
        <p v-else-if="sok.trim().length >= 2 && !treff.length" class="kig__status">Ingen klubber med det navnet.</p>

        <ul v-if="treff.length" class="kig__liste">
          <li v-for="c in treff" :key="c.fiksId">
            <button type="button" class="ds-card ds-card--interactive kig__klubb" @click="velgKlubb(c)">
              <img class="kig__logo" :src="clubLogo(c.fiksId)" alt="" loading="lazy" @error="$event.target.style.visibility = 'hidden'" />
              <span class="kig__klubbtekst">
                <span class="kig__klubbnavn">{{ c.name }}</span>
                <span class="kig__klubbmeta">{{ c.district }} · {{ c.teams.length }} lag</span>
              </span>
            </button>
          </li>
        </ul>
      </template>

      <!-- ------------------------------------------------ Årgang -->
      <template v-else-if="steg === 'argang'">
        <p class="kig__steg">Steg 2 av 3</p>
        <h1 class="kig__tittel">Hvilket årskull?</h1>
        <p class="kig__lead">{{ klubb?.name }}</p>

        <div class="kig__ar">
          <button
            v-for="y in argangValg"
            :key="y"
            type="button"
            class="kig__arknapp"
            :class="{ 'kig__arknapp--valgt': argang === y }"
            @click="argang = y"
          >{{ y }}</button>
        </div>

        <div class="kig__kjonn">
          <button type="button" class="kig__kjonnknapp" :class="{ 'kig__kjonnknapp--valgt': kjonn === 'G' }" @click="kjonn = 'G'">Gutter</button>
          <button type="button" class="kig__kjonnknapp" :class="{ 'kig__kjonnknapp--valgt': kjonn === 'J' }" @click="kjonn = 'J'">Jenter</button>
        </div>

        <p v-if="alder" class="kig__status">
          {{ alder }} år i {{ NAA }} — {{ lagForKjonn.length }}
          {{ lagForKjonn.length === 1 ? 'lag' : 'lag' }} hos {{ klubb?.name }}
        </p>

        <div class="kig__handling">
          <button type="button" class="ds-btn ds-btn--primary kig__hovedknapp" :disabled="!argang" @click="bekreftArgang">
            Videre
          </button>
        </div>
      </template>

      <!-- --------------------------------------------------- Lag -->
      <template v-else-if="steg === 'lag'">
        <p class="kig__steg">Steg 3 av 3</p>
        <h1 class="kig__tittel">{{ valgteLag.length }} lag</h1>
        <p class="kig__lead">
          <template v-if="lagVises.length && !viserAlle">Ta bort dem du ikke trener. Kampene til resten kommer med.</template>
          <template v-else-if="viserAlle">Alle lagene i klubben. Hak av dine.</template>
          <template v-else>{{ klubb?.name }} har ingen lag registrert på {{ alder }}-åringer i FIKS.</template>
        </p>

        <ul v-if="lagVises.length" class="kig__liste">
          <li v-for="t in lagVises" :key="t.fiksId">
            <button
              type="button"
              class="ds-card kig__lag"
              :class="{ 'kig__lag--valgt': valgte.has(t.fiksId) }"
              :aria-pressed="valgte.has(t.fiksId)"
              @click="toggle(t)"
            >
              <span class="kig__hake" aria-hidden="true">
                <svg v-if="valgte.has(t.fiksId)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <span class="kig__lagtekst">
                <span class="kig__lagnavn">{{ t.name }}</span>
                <span class="kig__lagmeta">Heter «{{ kortNavn(t) }}» i appen</span>
              </span>
            </button>
          </li>
        </ul>

        <button v-if="!viserAlle && klubb?.teams?.length" type="button" class="kig__lenke" @click="viserAlle = true">
          Vis alle {{ klubb.teams.length }} lagene i klubben
        </button>

        <p v-if="feil" class="kig__status kig__status--feil">{{ feil }}</p>

        <div class="kig__handling">
          <button type="button" class="ds-btn ds-btn--primary kig__hovedknapp" :disabled="!valgteLag.length || henter" @click="hent">
            Hent lag og kamper
          </button>
        </div>
      </template>

      <!-- ----------------------------------------------- Henting -->
      <template v-else-if="steg === 'henter'">
        <h1 class="kig__tittel">Henter fra fotball.no …</h1>
        <p class="kig__lead">{{ valgteLag.length }} lag. Dette tar noen sekunder.</p>
      </template>

      <!-- ------------------------------------------------ Ferdig -->
      <template v-else-if="steg === 'ferdig'">
        <h1 class="kig__tittel">Klart.</h1>
        <p class="kig__lead">
          {{ resultat?.lag }} lag og {{ resultat?.kamper }} kamper er inne.
          Nå mangler bare spillerne, de andre trenerne og treningene — de ligger som kort på Hjem.
        </p>
        <div class="kig__handling">
          <button type="button" class="ds-btn ds-btn--primary kig__hovedknapp" @click="ferdig">Til Hjem</button>
        </div>
      </template>
    </div>

    <button v-if="steg !== 'velkommen' && steg !== 'henter' && steg !== 'ferdig'" type="button" class="kig__hopp" @click="hoppOver">
      Sett opp for hånd i stedet
    </button>

    <p v-if="steg === 'velkommen'" class="kig__signatur">BenchBoss · Alex Monkey Business</p>
  </div>
</template>

<style scoped>
.kig {
  min-height: 100dvh;
  background: var(--ds-color-bg);
  display: flex;
  flex-direction: column;
  padding: var(--ds-space-xl) var(--ds-space-lg) var(--ds-space-2xl);
}

.kig__inner {
  flex: 1;
  width: 100%;
  max-width: 34rem;
  margin: 0 auto;
  padding-top: 12vh;
}

.kig__steg {
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wider);
  text-transform: uppercase;
  color: var(--ds-color-text-tertiary);
  margin: 0 0 var(--ds-space-sm);
}

.kig__tittel {
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-2xl);
  font-weight: var(--ds-weight-black);
  letter-spacing: var(--ds-tracking-tight);
  line-height: var(--ds-leading-tight);
  color: var(--ds-color-text-primary);
  margin: 0 0 var(--ds-space-sm);
}

.kig__lead {
  font-size: var(--ds-text-base);
  line-height: var(--ds-leading-snug);
  color: var(--ds-color-text-secondary);
  margin: 0 0 var(--ds-space-xl);
}

.kig__sok {
  width: 100%;
  font-size: var(--ds-text-lg);
  padding: var(--ds-space-md);
}

.kig__status {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  margin: var(--ds-space-md) 0 0;
}

.kig__status--feil { color: var(--ds-color-error); }

.kig__liste {
  list-style: none;
  margin: var(--ds-space-lg) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.kig__klubb,
.kig__lag {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  padding: var(--ds-space-md);
  text-align: left;
  cursor: pointer;
}

.kig__logo {
  width: 2.5rem;
  height: 2.5rem;
  object-fit: contain;
  flex-shrink: 0;
}

.kig__klubbtekst,
.kig__lagtekst {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.kig__klubbnavn,
.kig__lagnavn {
  font-weight: var(--ds-weight-semibold);
  color: var(--ds-color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kig__klubbmeta,
.kig__lagmeta {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
}

/* Laget velges ved å trykke på hele kortet; haken er tilstanden, ikke knappen. */
.kig__lag--valgt {
  border-color: var(--ds-color-accent);
  box-shadow: var(--ds-shadow-accent);
}

.kig__hake {
  width: 1.75rem;
  height: 1.75rem;
  flex-shrink: 0;
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-sm);
  display: grid;
  place-items: center;
  color: var(--ds-color-bg);
}

.kig__lag--valgt .kig__hake {
  background: var(--ds-color-accent);
  border-color: var(--ds-color-accent);
}

.kig__hake svg { width: 1.1rem; height: 1.1rem; }

.kig__ar {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(5rem, 1fr));
  gap: var(--ds-space-sm);
}

.kig__arknapp {
  padding: var(--ds-space-md) var(--ds-space-sm);
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  cursor: pointer;
  transition: border-color var(--ds-duration-fast) var(--ds-ease-out);
}

.kig__arknapp--valgt {
  border-color: var(--ds-color-accent);
  border-width: var(--ds-border-width-heavy);
  color: var(--ds-color-accent);
}

.kig__lenke {
  margin-top: var(--ds-space-md);
  padding: var(--ds-space-sm) 0;
  background: none;
  border: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  text-decoration: underline;
  cursor: pointer;
}

.kig__handling { margin-top: var(--ds-space-xl); }

.kig__hovedknapp {
  width: 100%;
  padding: var(--ds-space-md);
  font-size: var(--ds-text-lg);
}

.kig__hopp {
  margin: var(--ds-space-xl) auto 0;
  padding: var(--ds-space-sm);
  background: none;
  border: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-tertiary);
  cursor: pointer;
}

@media (min-width: 768px) {
  .kig__inner { padding-top: 16vh; }
}

.kig__kjonn {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-lg);
}

.kig__kjonnknapp {
  padding: var(--ds-space-md);
  font-family: var(--ds-font-display-sans);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-bold);
  color: var(--ds-color-text-primary);
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  cursor: pointer;
}

.kig__kjonnknapp--valgt {
  border-color: var(--ds-color-accent);
  border-width: var(--ds-border-width-heavy);
  color: var(--ds-color-accent);
}

.kig__tittel--velkomst { font-size: 2.25rem; }

.kig__velkomst {
  font-size: var(--ds-text-lg);
  line-height: var(--ds-leading-snug);
  color: var(--ds-color-text-secondary);
  margin: 0 0 var(--ds-space-md);
  max-width: 26ch;
}

.kig__velkomst strong {
  color: var(--ds-color-text-primary);
  font-weight: var(--ds-weight-semibold);
}

.kig__velkomst--dempet {
  font-size: var(--ds-text-base);
  color: var(--ds-color-text-tertiary);
}

.kig__signatur {
  margin: var(--ds-space-xl) auto 0;
  text-align: center;
  font-size: var(--ds-text-xs);
  letter-spacing: var(--ds-tracking-wide);
  color: var(--ds-color-text-tertiary);
}
</style>
