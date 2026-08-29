<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useFiks } from '../composables/useFiks'
import { useSeasons } from '../composables/useSeasons'
import { useSeasonTeams } from '../composables/useSeasonTeams'
import { useToast } from '../composables/useToast'
import { useTheme } from '../composables/useTheme'
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

// Temavelgeren bor ellers i Admin — og dit kommer man ikke før oppsettet er
// gjort, fordi guarden sender deg hit. Første skjerm er derfor eneste stedet
// en ny trener kan velge lys eller mørk.
const { theme, setTheme, systemDark } = useTheme()

// Defaulten er 'system', ikke 'light'/'dark'. Uten dette sto ingen av de to
// valgene markert, og pilla leste som to grå ord uten tilstand.
const aktivtTema = computed(() =>
  theme.value === 'system' ? (systemDark.value ? 'dark' : 'light') : theme.value
)
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
let klubbHenting = null

// Kom klubben ferdig koblet fra admin, er veiviseren to steg, ikke tre.
// Fanges ved oppstart: velger han klubb selv, skal telleren ikke krympe
// under beina på ham når koblingen lagres.
const klubbFraAdmin = ref(false)
const stegTotalt = computed(() => (klubbFraAdmin.value ? 2 : 3))
const stegNr = n => (klubbFraAdmin.value ? n - 1 : n)

onMounted(() => {
  klubbFraAdmin.value = !!activeCohort.value?.club_fiks_id
  klubbHenting = hentKoblet()
})

async function hentKoblet() {
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
}

// Velkomstskjermen er ett trykk, ikke et steg med et spørsmål i seg. Den
// finnes for å si hva som skal skje — at lagene og kampene hentes, og at han
// ikke skal skrive inn noe. Det er der aha-en ligger, ikke i en overskrift
// som skryter.
const fornavn = computed(() => (coach.value?.name || '').split(' ')[0])

// Trykker han før hentingen er ferdig, skal han vente et blunk på «Henter
// lagene …» — ikke havne i klubbsøket for en klubb appen alt kjenner.
async function start() {
  if (!klubb.value && activeCohort.value?.club_fiks_id) {
    steg.value = 'klubb'
    laster.value = true
    try { await klubbHenting } catch { /* hentKoblet svelger sine egne feil */ }
    laster.value = false
  }
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
    } catch (e) {
      // AbortError = vi ga opp å vente, ikke at fotball.no er nede. Å si
      // «fikk ikke kontakt» om et tregt søk sender folk til feil løsning.
      feil.value = e?.name === 'AbortError'
        ? 'Søket tok for lang tid. Prøv hele klubbnavnet.'
        : 'Fikk ikke kontakt med fotball.no.'
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
    await setBirthYear(argang.value, kjonn.value)
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

// Velger han feil årgang, var lag-steget en blindvei: reload var eneste vei
// tilbake. Velkomsten er ikke et steg med et spørsmål i seg, så den er ikke
// med i kjeden.
const FORRIGE = { argang: 'klubb', lag: 'argang' }
// Kom klubben fra admin, er årgangen første steg — og et førstesteg har
// ingenting bak seg. Er klubben feil, retter admin den; det er hans valg.
const kanGaTilbake = computed(() =>
  !!FORRIGE[steg.value] && !(steg.value === 'argang' && klubbFraAdmin.value)
)

function tilbake() {
  const f = FORRIGE[steg.value]
  if (f) { feil.value = ''; steg.value = f }
}

function hoppOver() {
  // Kullet kan settes opp for hånd på Hjem. Vi husker valget så veiviseren
  // ikke tar over skjermen igjen ved neste innlogging.
  try { localStorage.setItem(`bb_komigang_hoppet_${activeCohort.value?.id}`, '1') } catch { /* privat modus */ }
  router.replace('/')
}
</script>

<template>
  <div class="kig" :class="{ 'kig--velkomst': steg === 'velkommen' || steg === 'ferdig' }">
    <div class="kig__inner" :class="{ 'kig__inner--velkomst': steg === 'velkommen' || steg === 'ferdig' }">
      <button v-if="kanGaTilbake && !laster" type="button" class="kig__tilbake" @click="tilbake">
        Tilbake
      </button>

      <!-- ---------------------------------------------- Velkommen -->
      <template v-if="steg === 'velkommen'">
        <div class="kig-tema" role="radiogroup" aria-label="Lyst eller mørkt">
          <button
            v-for="t in [{ v: 'light', l: 'Lys' }, { v: 'dark', l: 'Mørk' }]"
            :key="t.v"
            type="button"
            role="radio"
            :aria-checked="aktivtTema === t.v"
            class="kig-tema__valg"
            :class="{ 'kig-tema__valg--aktiv': aktivtTema === t.v }"
            @click="setTheme(t.v)"
          >{{ t.l }}</button>
        </div>

        <!-- Animasjonen ER løftet: tomme kamprader som fyller seg selv mens
             han ser på. Treneren peker på dem. Pynt hadde vært billigere,
             men dette viser det setningen påstår. -->
        <div class="kig-hero" aria-hidden="true">
          <img
            class="kig-hero__trener"
            src="/illustrations/bench-boss-transparent-library/coach-mascot-520.png"
            alt=""
            width="520"
            height="520"
            fetchpriority="high"
          />
        </div>

        <h1 class="kig__tittel kig__tittel--velkomst">
          Velkommen til <span class="kig__merke">BenchBoss</span>{{ fornavn ? ', ' + fornavn : '' }}!
        </h1>
        <p class="kig__velkomst">
          Kamper, spilletid, treninger og hvem som stiller —
          <strong>på ett sted.</strong> Ikke i seks meldingstråder og et regneark.
        </p>
        <p class="kig__velkomst kig__velkomst--dempet">
          Vi setter opp laget ditt nå. Det tar et minutt.
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
        <p v-if="!klubbFraAdmin" class="kig__steg">Steg 1 av {{ stegTotalt }}</p>
        <h1 class="kig__tittel">Hvilken klubb?</h1>
        <!-- Løftet om fotball.no bor HER, ikke på velkomsten: det er dette
             steget det faktisk skjer i. Velkomsten sier hva appen er. -->
        <p class="kig__lead">Vi henter lagene og hele terminlista fra fotball.no, så du slipper å skrive dem inn.</p>

        <input
          v-model="sok"
          class="ds-input kig__sok"
          type="search"
          autocomplete="off"
          placeholder="Søk etter klubben"
          aria-label="Søk etter klubben"
        />

        <p v-if="searching" class="kig__status">Søker på fotball.no … korte søk kan ta noen sekunder.</p>
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
        <p class="kig__steg">Steg {{ stegNr(2) }} av {{ stegTotalt }}</p>
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
        <p class="kig__steg">Steg {{ stegNr(3) }} av {{ stegTotalt }}</p>
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
        <img
          class="kig__kvittering"
          src="/illustrations/bench-boss-feature-icons/season-import-420.png"
          alt=""
          width="420"
          height="420"
        />
        <h1 class="kig__tittel">Klart.</h1>
        <!-- Sto før: «de ligger som kort på Hjem». Det beskrev hvordan VI har
             bygget det, ikke hva han skal gjøre. Og det var feil: trenerkortet
             er ute av onboardingen, og treninger har aldri vært et kort. Det
             eneste som faktisk står igjen er spillerne. -->
        <p class="kig__lead">
          {{ resultat?.lag }} lag og {{ resultat?.kamper }} kamper er inne.
          Nå mangler bare spillerne — det ordner du på Hjem.
        </p>
        <div class="kig__handling">
          <button type="button" class="ds-btn ds-btn--primary kig__hovedknapp" @click="ferdig">Til Hjem</button>
        </div>
      </template>
    </div>

    <button v-if="steg !== 'velkommen' && steg !== 'henter' && steg !== 'ferdig'" type="button" class="kig__hopp" @click="hoppOver">
      Sett opp for hånd i stedet
    </button>

    <p v-if="steg === 'velkommen'" class="kig__signatur">Alex Monkey Business</p>
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

.kig__inner--velkomst .kig__handling { margin-top: clamp(var(--ds-space-md), 2.5dvh, var(--ds-space-xl)); }

.kig__hovedknapp {
  width: 100%;
  padding: var(--ds-space-md);
  font-size: var(--ds-text-lg);
}

.kig__tilbake {
  align-self: flex-start;
  margin-bottom: var(--ds-space-md);
  padding: var(--ds-space-xs) 0;
  min-height: 44px;
  background: none;
  border: 0;
  font-family: var(--ds-font-body);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
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

.kig__tittel--velkomst {
  /* «Velkommen til BenchBoss, Sten!» er tre ganger så langt som «Hei, Sten.»
     — men det sier hvor du har havnet, som er hele jobben til en skjerm man
     kommer til fra en e-post. */
  font-size: clamp(1.5rem, 4.6dvh, 2rem);
  margin-bottom: clamp(var(--ds-space-xs), 1.5dvh, var(--ds-space-sm));
}

/* --ds-color-accent er nøytral (nesten hvit i mørk, nesten svart i lys) —
   den ga ingen synlig forskjell. --ds-color-warm er appens ekte aksent:
   terrakotta i lys, varm oransje i mørk, og den samme fargen som kjegla
   maskoten står ved. */
.kig__merke { color: var(--ds-color-warm); }

.kig__velkomst {
  font-size: clamp(var(--ds-text-base), 2.2dvh, var(--ds-text-lg));
  line-height: var(--ds-leading-snug);
  color: var(--ds-color-text-secondary);
  margin: 0 0 clamp(var(--ds-space-sm), 1.8dvh, var(--ds-space-md));
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
  margin: clamp(var(--ds-space-md), 2.5dvh, var(--ds-space-xl)) auto 0;
  text-align: center;
  font-size: var(--ds-text-xs);
  letter-spacing: var(--ds-tracking-wide);
  color: var(--ds-color-text-tertiary);
}

/* Velkomsten skal ALLTID få plass — den scrollet på alt under en Pro Max,
   og «Kom i gang» lå under folden på SE, SE2 og mini. Sentrert i tilgjengelig
   høyde, og luften rundt kuttet: xl + 2xl er 80 px en lav skjerm ikke har. */
.kig--velkomst {
  padding-top: var(--ds-space-md);
  padding-bottom: var(--ds-space-md);
}

.kig__inner--velkomst {
  padding-top: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

/* ---- Velkomst-hero ---- */
/* Bare treneren. Kampkortene sa det samme som setningen under, og to ting
   som sier det samme konkurrerer. Han peker fortsatt — nå på ingenting
   spesielt, som en trener som skal til å forklare noe. */
.kig-hero {
  display: flex;
  justify-content: center;
  margin: 0 0 clamp(var(--ds-space-md), 3dvh, var(--ds-space-xl));
  flex-shrink: 1;
  min-height: 0;
}

.kig-hero__trener {
  width: auto;
  height: clamp(9rem, 30dvh, 17rem);
  max-width: 100%;
  object-fit: contain;
  animation: kigFloat 5s ease-in-out infinite;
}

@keyframes kigFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
}

/* Bevegelsen er poenget, men ikke på bekostning av noen. */
@media (prefers-reduced-motion: reduce) {
  .kig-hero__trener { animation: none; }
}

@media (min-width: 480px) {
  .kig-hero__trener { height: clamp(11rem, 32dvh, 19rem); }
}

/* Under ~600 px synlig høyde er maskoten det første som må vike — teksten
   og knappen er jobben, illustrasjonen er innpakningen. */
@media (max-height: 600px) {
  /* Luften rundt er det billigste å gi fra seg. Så maskoten — teksten og
     knappen er jobben, illustrasjonen er innpakningen. */
  .kig { padding-top: var(--ds-space-md); padding-bottom: var(--ds-space-md); }
  .kig-hero__trener { height: clamp(5.5rem, 23dvh, 10rem); }
  .kig__velkomst--dempet { display: none; }
  .kig__signatur { display: none; }
}

.kig-tema {
  display: flex;
  gap: 2px;
  padding: 2px;
  /* Til VENSTRE: maskoten står til høyre og strekker seg oppover, og
     pilla la seg rett ved hodet hans på lave skjermer. */
  margin: 0 auto clamp(var(--ds-space-sm), 2dvh, var(--ds-space-lg)) 0;
  flex-shrink: 0;
  width: fit-content;
  background: var(--ds-color-bg-elevated);
  border: var(--ds-border-width) solid var(--ds-color-border-light, var(--ds-color-border));
  border-radius: var(--ds-radius-full);
  box-shadow: var(--ds-shadow-sm);
}

.kig-tema__valg {
  min-height: 34px;
  padding: 0 var(--ds-space-md);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-weight-semibold);
  letter-spacing: var(--ds-tracking-wide);
  color: var(--ds-color-text-tertiary);
  background: none;
  border: 0;
  border-radius: var(--ds-radius-full);
  cursor: pointer;
}

.kig-tema__valg--aktiv {
  color: var(--ds-color-bg);
  background: var(--ds-color-text-primary);
}

/* Kvitteringen på at terminlista faktisk landet. Samme leire-stil som
   maskoten, og motivet er bokstavelig: kalender, ball og en pil som peker
   inn. Den spretter én gang — det er en bekreftelse, ikke en loop. */
.kig__kvittering {
  display: block;
  /* align-self er poenget: .kig__inner er flex column, og default
     `align-items: stretch` strakk bildet ut i full bredde og overkjørte
     `width: auto`. Ballen ble en ellipse. */
  align-self: flex-start;
  object-fit: contain;
  width: auto;
  height: clamp(7rem, 26dvh, 13rem);
  margin: 0 0 clamp(var(--ds-space-md), 3dvh, var(--ds-space-xl));
  animation: kigKvitteringInn 0.5s var(--ds-ease-pop) both;
}

@keyframes kigKvitteringInn {
  from { opacity: 0; transform: scale(0.86) translateY(10px); }
  to   { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .kig__kvittering { animation: none; }
}
</style>
