// member-admin — det eneste stedet service_role finnes.
//
// Klienten sender ALDRI sin egen rolle. Funksjonen leser kallerens JWT, slår
// opp rollen med service-nøkkelen, og avgjør selv. Alt annet ville betydd at
// «jeg er admin» er noe man kan skrive i devtools.
//
// Handlinger: invite, resend, set_role, revoke.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { inviteHtml } from './invite-mail.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ROLES = ['admin', 'coach', 'parent']
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://benchboss.no'

// Invitasjonen sendes av oss, ikke av Supabase. Mangler nøkkelen, faller vi
// tilbake på innloggings-e-posten — en invitasjon som ikke kommer fram er
// verre enn en med feil overskrift.
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
// Kan pekes et annet sted i test: nøkkelen vår er «send only» og kan ikke lese
// en sendt e-post tilbake, så innholdet må fanges på vei ut.
const RESEND_URL = Deno.env.get('RESEND_URL') ?? 'https://api.resend.com/emails'
const INVITE_FROM = Deno.env.get('INVITE_FROM') ?? 'BenchBoss <ikke-svar@benchboss.no>'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function fail(message: string, status = 400) {
  return json({ error: message }, status)
}

/**
 * Hvem er kalleren, og hva får hen gjøre i dette kullet?
 * platform > admin > coach (kun når kullet har allow_coach_invites på).
 */
async function authorize(admin: any, userId: string, cohortId: string) {
  const { data: profile } = await admin
    .from('profiles').select('is_platform_admin').eq('id', userId).maybeSingle()
  if (profile?.is_platform_admin) return 'platform'

  const { data: member } = await admin
    .from('cohort_members').select('role, status')
    .eq('profile_id', userId).eq('cohort_id', cohortId).eq('status', 'active')
    .maybeSingle()
  if (!member) return null
  if (member.role === 'admin') return 'admin'

  if (member.role === 'coach') {
    const { data: cohort } = await admin
      .from('cohorts').select('allow_coach_invites').eq('id', cohortId).maybeSingle()
    if (cohort?.allow_coach_invites) return 'coach'
  }
  return null
}

/**
 * Trenere trenger en coaches-rad — den er identiteten som expenses.paid_by og
 * match_coaches peker på, og den skal overleve at tilgangen fjernes.
 * Gjenbrukes hvis navnet allerede finnes i kullet.
 */
async function ensureCoach(admin: any, cohortId: string, name: string) {
  const { data: existing } = await admin
    .from('coaches').select('id').eq('cohort_id', cohortId).eq('name', name).maybeSingle()
  if (existing) return existing.id

  const { data, error } = await admin
    .from('coaches').insert({ cohort_id: cohortId, name }).select('id').single()
  if (error) throw new Error(`Kunne ikke opprette trenerprofil: ${error.message}`)
  return data.id
}

/**
 * Lagtilhørighet er en RAD i team_coaches, ikke en preferanse på medlemmet.
 * Den skrives per sesong: når lagene roterer til våren, står fjorårets
 * kobling igjen, og «hvem trente Grønn i høst» er fortsatt sant.
 *
 * `cohort_members.preferred_team` settes til det samme, men den er noe annet
 * — den seeder brukerens egne filtre. De faller sammen for trenere, og det er
 * greit, så lenge man vet hvilken av dem som styrer hva.
 */
async function setCoachTeam(admin: any, cohortId: string, coachId: string | null, teamSlug: string | null) {
  if (!coachId) return

  const { data: cohort } = await admin
    .from('cohorts').select('active_season_id').eq('id', cohortId).maybeSingle()
  const seasonId = cohort?.active_season_id
  if (!seasonId) return

  // Kun inneværende sesong ryddes. Tidligere sesonger er historikk.
  await admin.from('team_coaches')
    .delete()
    .eq('cohort_id', cohortId).eq('coach_id', coachId).eq('season_id', seasonId)

  if (!teamSlug) return

  const { data: team } = await admin
    .from('teams').select('id').eq('cohort_id', cohortId).eq('slug', teamSlug).maybeSingle()
  if (!team) return

  await admin.from('team_coaches').insert({
    cohort_id: cohortId,
    team_id: team.id,
    coach_id: coachId,
    season_id: seasonId,
  })
}

/**
 * En invitert bruker står ubekreftet til hen klikker lenken. Med
 * disable_signup slått på betyr ubekreftet at KODEVEIEN avvises — så utløper
 * lenken, er personen låst ute for godt.
 *
 * Vi bekreftet derfor med én gang. Men vi ANTOK at kallet slo til, og det
 * gjorde det ikke: fire trenere sto ubekreftet etter invitasjon. Nå leses det
 * tilbake, og svaret sier fra hvis det fortsatt ikke tok.
 */
async function confirmUser(admin: any, userId: string): Promise<boolean> {
  await admin.auth.admin.updateUserById(userId, { email_confirm: true })
  const { data } = await admin.auth.admin.getUserById(userId)
  if (data?.user?.email_confirmed_at) return true

  // Ett nytt forsøk — så gir vi opp og sier det høyt.
  await admin.auth.admin.updateUserById(userId, { email_confirm: true })
  const { data: again } = await admin.auth.admin.getUserById(userId)
  return !!again?.user?.email_confirmed_at
}

/**
 * Kontoen opprettes FERDIG BEKREFTET, og uten e-post.
 *
 * Rekkefølgen var lenge omvendt: inviteUserByEmail og så bekreft. Da var lenka
 * i e-posten død i det den landet — e-postbekreftelsen nuller nettopp det
 * `confirmation_token` lenka bærer. Uten bekreftelsen er kodeveien stengt,
 * fordi prosjektet har disable_signup på. Altså: én av de to veiene inn var
 * alltid ødelagt.
 */
async function ensureConfirmedUser(admin: any, email: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (!error) return { id: data?.user?.id }
  if (!/already|registered|exist/i.test(error.message)) return { error: error.message }

  // Finnes fra før. Profiles speiler auth.users, så e-posten kan slås opp der.
  const { data: profile } = await admin
    .from('profiles').select('id').ilike('email', email).maybeSingle()
  if (profile?.id) await confirmUser(admin, profile.id)
  return { id: profile?.id }
}

/**
 * Den vanlige innloggings-e-posten — med både lenke og kode, slik /login
 * sender den. Begge lever, og går de ut på dato kan personen be om en ny selv.
 */
async function sendLoginEmail(email: string): Promise<string | undefined> {
  const anon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false } },
  )
  const { error } = await anon.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${SITE_URL}/auth/callback` },
  })
  if (!error) return undefined
  // GoTrue sperrer flere e-poster til samme adresse rett etter hverandre.
  // «you can only request this after 0 seconds» hjelper ingen.
  if (/rate limit|only request this after/i.test(error.message)) {
    return 'det gikk nettopp ut en e-post til denne adressen. Prøv igjen om et minutt.'
  }
  return error.message
}

async function sendInviteEmail(
  admin: any,
  email: string,
  navn: string,
  kull: string,
  fra: string,
): Promise<string | undefined> {
  if (!RESEND_KEY) return 'mangler RESEND_API_KEY'

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${SITE_URL}/auth/callback` },
  })
  if (error) return error.message

  const kode = data?.properties?.email_otp
  const lenke = data?.properties?.action_link
  if (!kode || !lenke) return 'fikk ingen lenke fra Supabase'

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: INVITE_FROM,
      to: [email],
      subject: `Du har tilgang til ${kull} i BenchBoss`,
      html: inviteHtml(navn.split(' ')[0], kull, fra, kode, lenke),
    }),
  })
  if (res.ok) return undefined

  const tekst = await res.text()
  return `Resend svarte ${res.status}: ${tekst.slice(0, 200)}`
}

/**
 * Hva laget heter i e-posten.
 *
 * Et kull som ikke er satt opp heter «Stag – nytt kull» — et arbeidsnavn admin
 * aldri valgte, og som treneren overskriver i det han velger årgang. Det skal
 * ikke stå i den første e-posten han får. Da er klubben det eneste vi VET.
 */
async function lagNavn(admin: any, cohortId: string): Promise<string> {
  const { data } = await admin
    .from('cohorts').select('name, birth_year, clubs(name)').eq('id', cohortId).maybeSingle()
  if (data?.birth_year) return data.name
  return data?.clubs?.name || data?.name || 'laget'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('Bare POST', 405)

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!jwt) return fail('Mangler pålogging', 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data: caller, error: callerError } = await admin.auth.getUser(jwt)
  if (callerError || !caller?.user) return fail('Ugyldig pålogging', 401)
  const callerId = caller.user.id

  let body: any
  try {
    body = await req.json()
  } catch {
    return fail('Ugyldig forespørsel')
  }

  const action = body?.action

  // Alle handlinger utenom invite peker på en medlemsrad; kullet hentes derfra
  // og aldri fra klienten, så man ikke kan oppgi et kull man er admin i og
  // handle på en rad i et annet.
  //
  // `set_team` kan i tillegg peke på en TRENERRAD. Det er ikke en bekvemmelighet:
  // RLS-policyen own_membership_select gjør at en trener uten admin bare ser sin
  // egen medlemsrad, så trenersiden (/trener/:id) kan ikke slå opp member_id for
  // noen andre. Kullet hentes da fra `coaches.cohort_id` — fortsatt aldri fra
  // klienten, så invarianten over står.
  let cohortId = body?.cohort_id
  let member: any = null
  let coachId: string | null = null

  if (action === 'set_team' && !body?.member_id && body?.coach_id) {
    const { data: c } = await admin
      .from('coaches').select('id, cohort_id').eq('id', body.coach_id).maybeSingle()
    if (!c) return fail('Fant ikke treneren', 404)
    cohortId = c.cohort_id
    coachId = c.id
    // Kan være null: en trenerrad uten medlemskap. Da settes laget likevel,
    // og preferred_team hoppes over — den hører til medlemsraden som ikke finnes.
    const { data: m } = await admin
      .from('cohort_members')
      .select('id, cohort_id, profile_id, role, status, name, email, coach_id')
      .eq('cohort_id', c.cohort_id).eq('coach_id', c.id).maybeSingle()
    member = m
  } else if (action !== 'invite') {
    if (!body?.member_id) return fail('Mangler member_id')
    const { data } = await admin
      .from('cohort_members')
      .select('id, cohort_id, profile_id, role, status, name, email, coach_id')
      .eq('id', body.member_id).maybeSingle()
    if (!data) return fail('Fant ikke medlemmet', 404)
    member = data
    cohortId = data.cohort_id
  }

  if (!cohortId) return fail('Mangler cohort_id')

  const level = await authorize(admin, callerId, cohortId)
  if (!level) return fail('Ingen tilgang til dette kullet', 403)

  try {
    switch (action) {
      // ---------------------------------------------------------------- invite
      case 'invite': {
        const name = (body.name || '').trim()
        const email = (body.email || '').trim().toLowerCase()
        const role = body.role

        if (!name) return fail('Navn mangler')
        if (!email.includes('@')) return fail('E-postadressen ser ikke riktig ut')
        if (!ROLES.includes(role)) return fail('Ukjent rolle')
        // En trener som har fått lov til å invitere skal ikke kunne lage en
        // admin ved siden av seg.
        if (level === 'coach' && role === 'admin') {
          return fail('Bare en admin kan invitere en admin', 403)
        }

        const { data: dupe } = await admin
          .from('cohort_members').select('id, status')
          .eq('cohort_id', cohortId).ilike('email', email).maybeSingle()
        if (dupe) return fail('Denne e-posten er allerede invitert til kullet')

        const coachId = role === 'parent' ? null : await ensureCoach(admin, cohortId, name)

        // Kullet ble seedet med medlemsrader UTEN e-post (navn + rolle + kobling
        // til trenerprofilen). Setter man inn en ny rad her, står personen to
        // ganger i lista — én «Mangler e-post» og én «Invitert». Finn den
        // eksisterende raden og gi den en e-post i stedet.
        const { data: seeded } = await admin
          .from('cohort_members')
          .select('id')
          .eq('cohort_id', cohortId)
          .is('email', null)
          .ilike('name', name)
          .maybeSingle()

        let row: { id: string } | null = null

        if (seeded) {
          const { data, error } = await admin
            .from('cohort_members')
            .update({
              role,
              status: 'invited',
              email,
              coach_id: coachId ?? undefined,
              preferred_team: body.preferred_team || null,
              invited_at: new Date().toISOString(),
            })
            .eq('id', seeded.id)
            .select('id').single()
          if (error) return fail(`Kunne ikke oppdatere medlemmet: ${error.message}`)
          row = data
        } else {
          const { data, error } = await admin
            .from('cohort_members')
            .insert({
              cohort_id: cohortId,
              role,
              status: 'invited',
              name,
              email,
              coach_id: coachId,
              preferred_team: body.preferred_team || null,
              invited_at: new Date().toISOString(),
            })
            .select('id').single()
          if (error) return fail(`Kunne ikke lagre medlemmet: ${error.message}`)
          row = data
        }

        await setCoachTeam(admin, cohortId, coachId, body.preferred_team || null)

        // «Kom i gang»-malen kostet oss lenka. En e-post med riktig overskrift
        // og en død lenke er verre enn en som virker.
        const konto = await ensureConfirmedUser(admin, email)
        if (konto.error) {
          // Slett bare raden hvis VI opprettet den. En seedet rad som fantes
          // fra før skal ikke forsvinne fordi e-posten ikke gikk ut.
          if (!seeded) await admin.from('cohort_members').delete().eq('id', row!.id)
          return fail(`Invitasjonen ble ikke sendt: ${konto.error}`)
        }

        const [kullNavn, { data: avsender }] = await Promise.all([
          lagNavn(admin, cohortId),
          admin.from('profiles').select('full_name').eq('id', callerId).maybeSingle(),
        ])

        // Vår egen invitasjon først. Går den ikke ut — nøkkelen mangler, Resend
        // svarer noe rart — sendes innloggings-e-posten i stedet. Personen skal
        // uansett komme inn.
        let sendFeil = await sendInviteEmail(admin, email, name, kullNavn, avsender?.full_name || '')
        if (sendFeil) {
          console.warn('Invitasjonen falt tilbake på innloggings-e-posten:', sendFeil)
          sendFeil = await sendLoginEmail(email)
        }

        return json({
          ok: true,
          member_id: row!.id,
          note: sendFeil
            ? `Tilgangen er gitt, men e-posten gikk ikke ut: ${sendFeil}. Bruk «Send på nytt».`
            : undefined,
        })
      }

      // ---------------------------------------------------------------- resend
      case 'resend': {
        if (member.status === 'revoked') return fail('Tilgangen er fjernet')
        if (!member.email) return fail('Medlemmet har ingen e-post')

        // Samme vei som invite: kontoen finnes og er bekreftet, så går den
        // vanlige innloggings-e-posten ut. Ligger det en gammel ubekreftet
        // konto her fra før, bekreftes den nå — det er den som var låst ute.
        const konto = await ensureConfirmedUser(admin, member.email)
        if (konto.error) return fail(`Kunne ikke sende: ${konto.error}`)

        // Har hen aldri logget inn, er dette fortsatt en invitasjon — ikke en
        // «logg inn igjen»-e-post til noen som ikke vet hva appen er.
        let sendFeil: string | undefined
        if (member.status === 'invited') {
          const [kullNavn, { data: avsender }] = await Promise.all([
            lagNavn(admin, cohortId),
            admin.from('profiles').select('full_name').eq('id', callerId).maybeSingle(),
          ])
          sendFeil = await sendInviteEmail(
            admin, member.email, member.name || '', kullNavn, avsender?.full_name || '',
          )
        }
        if (sendFeil || member.status !== 'invited') sendFeil = await sendLoginEmail(member.email)
        if (sendFeil) return fail(`Kunne ikke sende: ${sendFeil}`)

        await admin.from('cohort_members')
          .update({ invited_at: new Date().toISOString() }).eq('id', member.id)

        return json({ ok: true })
      }

      // -------------------------------------------------------------- set_role
      case 'set_role': {
        if (level === 'coach') return fail('Bare en admin kan endre roller', 403)
        if (!ROLES.includes(body.role)) return fail('Ukjent rolle')
        if (member.profile_id === callerId && body.role !== 'admin') {
          return fail('Du kan ikke frata deg selv admin-rollen')
        }

        // En trener trenger en coaches-rad; en forelder skal ikke ha en, men
        // den eksisterende slettes aldri — utlegg og kamptrenere peker på den.
        const coachId = body.role === 'parent'
          ? member.coach_id
          : member.coach_id ?? await ensureCoach(admin, cohortId, member.name)

        const { error } = await admin.from('cohort_members')
          .update({ role: body.role, coach_id: coachId }).eq('id', member.id)
        if (error) return fail(`Kunne ikke endre rolle: ${error.message}`)

        // En forelder er ikke trener for et lag. coaches-raden består —
        // det er bare koblingen til laget som opphører.
        if (body.role === 'parent') {
          await setCoachTeam(admin, cohortId, member.coach_id, null)
        }

        return json({ ok: true })
      }

      // ------------------------------------------------------------ set_email
      // Lagre adressen uten å sende noe. Lar deg samle inn alle fire først og
      // invitere når du er klar — og ingen får en e-post før du bestemmer det.
      case 'set_email': {
        const email = (body.email || '').trim().toLowerCase()
        if (!email.includes('@')) return fail('E-postadressen ser ikke riktig ut')
        if (member.status === 'revoked') return fail('Tilgangen er fjernet')

        const { data: taken } = await admin
          .from('cohort_members').select('id')
          .eq('cohort_id', cohortId).ilike('email', email).neq('id', member.id).maybeSingle()
        if (taken) return fail('E-posten er allerede i bruk i kullet')

        // invited_at nullstilles KUN når adressen faktisk endres. Lagrer man
        // den samme adressen på nytt, er invitasjonen fortsatt sendt — og å
        // nullstille den ville slettet beviset og fått skjermen til å påstå
        // «ikke invitert ennå» om en e-post som ligger i innboksen.
        const changed = (member.email || '').toLowerCase() !== email
        const patch: Record<string, unknown> = { email }
        if (changed) patch.invited_at = null

        const { error } = await admin
          .from('cohort_members')
          .update(patch)
          .eq('id', member.id)
        if (error) return fail(`Kunne ikke lagre e-posten: ${error.message}`)

        return json({ ok: true })
      }

      // ---------------------------------------------------------- send_invite
      // Medlemmet finnes fra før (seedet eller opprettet uten e-post). Raden
      // peker vi på med id — ingen navne-matching, ingen tvetydighet.
      case 'send_invite': {
        const email = (body.email || '').trim().toLowerCase()
        if (!email.includes('@')) return fail('E-postadressen ser ikke riktig ut')
        if (member.status === 'revoked') return fail('Tilgangen er fjernet')

        const { data: taken } = await admin
          .from('cohort_members').select('id')
          .eq('cohort_id', cohortId).ilike('email', email).neq('id', member.id).maybeSingle()
        if (taken) return fail('E-posten er allerede i bruk i kullet')

        const { error: updateError } = await admin
          .from('cohort_members')
          .update({ email, status: 'invited', invited_at: new Date().toISOString() })
          .eq('id', member.id)
        if (updateError) return fail(`Kunne ikke lagre e-posten: ${updateError.message}`)

        const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
          email,
          { redirectTo: `${SITE_URL}/auth/callback` },
        )

        if (inviteError && !/already/i.test(inviteError.message)) {
          return fail(`Invitasjonen ble ikke sendt: ${inviteError.message}`)
        }

        let warning: string | undefined
        if (invited?.user?.id && !(await confirmUser(admin, invited.user.id))) {
          warning = 'Invitasjonen er sendt, men kontoen ble ikke bekreftet. Utløper lenken, må den sendes på nytt.'
        }

        return json({ ok: true, note: warning })
      }

      // -------------------------------------------------------------- set_team
      // Lagoppsettet er noe hele trenerteamet steller med, ikke en admin-sak:
      // åpnet for alle trenere 2026-08-18, samtidig som trenersiden kom.
      // Merk hva det betyr: laget styrer hvilke kamper som havner på Hjem, og
      // nå kan hvem som helst i teamet endre det for hvem som helst.
      case 'set_team': {
        if (member?.role === 'parent') return fail('En forelder hører ikke til et lag')

        const target = member?.coach_id || coachId
        if (!target) return fail('Medlemmet har ingen trenerprofil')

        const slug = body.team || null
        await setCoachTeam(admin, cohortId, target, slug)

        // Uten medlemsrad finnes ingen preferred_team å holde i sync. Da er
        // team_coaches alene fasit, og det er den som styrer uansett.
        if (member) {
          const { error } = await admin.from('cohort_members')
            .update({ preferred_team: slug }).eq('id', member.id)
          if (error) return fail(`Kunne ikke lagre laget: ${error.message}`)
        }

        return json({ ok: true })
      }

      // ---------------------------------------------------------------- revoke
      case 'revoke': {
        if (level === 'coach') return fail('Bare en admin kan fjerne tilgang', 403)
        if (member.profile_id === callerId) return fail('Du kan ikke fjerne din egen tilgang')

        if (member.role === 'admin') {
          const { count } = await admin
            .from('cohort_members')
            .select('id', { count: 'exact', head: true })
            .eq('cohort_id', cohortId).eq('role', 'admin').neq('status', 'revoked')
          if ((count ?? 0) <= 1) return fail('Kullet må ha minst én admin')
        }

        // Raden i `coaches` røres ALDRI. expenses.paid_by og match_coaches
        // peker på den, og historiske utlegg må overleve at en trener slutter.
        const { error } = await admin.from('cohort_members')
          .update({ status: 'revoked' }).eq('id', member.id)
        if (error) return fail(`Kunne ikke fjerne tilgang: ${error.message}`)

        // Dreper refresh-tokens. Et allerede utstedt access-token lever inntil
        // en time — derfor sjekker policyene også status, ikke bare medlemskap.
        if (member.profile_id) {
          await admin.auth.admin.signOut(member.profile_id, 'global').catch(() => {})
        }

        return json({ ok: true })
      }

      default:
        return fail('Ukjent handling')
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Uventet feil', 500)
  }
})
