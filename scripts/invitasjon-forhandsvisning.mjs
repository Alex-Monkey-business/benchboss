// Skriver invitasjons-e-posten til en fil så den kan åpnes i nettleseren
// før noen faktisk får den. Samme mal som edge-funksjonen bruker.
import { inviteHtml } from '../supabase/functions/member-admin/invite-mail.ts'
import { writeFileSync } from 'node:fs'
const ut = process.argv[2] || 'invitasjon.html'
writeFileSync(ut, inviteHtml('Sten', 'Stag G2018', 'Alexander Samnøy', '482913', 'https://benchboss.no'))
console.log(ut)
