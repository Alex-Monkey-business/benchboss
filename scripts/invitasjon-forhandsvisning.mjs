// Skriver invitasjons-e-posten til en fil så den kan åpnes i nettleseren
// før noen faktisk får den. Samme mal som edge-funksjonen bruker.
import { inviteHtml } from '../supabase/functions/member-admin/invite-mail.ts'
import { writeFileSync } from 'node:fs'
const ut = process.argv[2] || 'invitasjon.html'
// Slik den faktisk ser ut for Sten: kullet er ikke satt opp ennå, så det er
// KLUBBEN som står der — arbeidsnavnet «Stag – nytt kull» skal aldri ut.
writeFileSync(ut, inviteHtml('Sten', 'Sportsklubben Stag', 'Alexander Samnøy', '482913', 'https://benchboss.no'))
console.log(ut)
