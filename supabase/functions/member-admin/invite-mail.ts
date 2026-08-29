/**
 * Den første e-posten er ikke en innlogging, den er en invitasjon: mottakeren
 * har aldri sett appen. Supabase sin magic link-mal sier «Logg inn i
 * BenchBoss» og kan ikke si noe annet — den brukes av alle innlogginger.
 *
 * Derfor lages lenka og koden med generateLink (som IKKE sender noe), og vi
 * sender vår egen e-post gjennom Resend. Innloggingsmalen får være i fred.
 */
export function inviteHtml(fornavn: string, kull: string, fra: string, kode: string, lenke: string) {
  const hilsen = fornavn ? `Velkommen til BenchBoss, ${fornavn}.` : 'Velkommen til BenchBoss.'
  const gitt = fra
    ? `${fra} har gitt deg tilgang til ${kull}.`
    : `Du har fått tilgang til ${kull}.`
  return `<!doctype html>
<html lang="no"><body style="margin:0;padding:24px;background:#f4f2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1b19">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e3ded6;border-radius:14px;padding:32px">
    <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3">${hilsen}</h1>
    <p style="margin:0 0 20px;font-size:16px;line-height:1.5">${gitt}</p>
    <p style="margin:0 0 28px;font-size:16px;line-height:1.5;color:#5c574f">
      Kamper, spilletid, treninger og hvem som stiller — på ett sted.
    </p>

    <p style="margin:0 0 6px;font-size:14px;color:#5c574f">Koden din:</p>
    <p style="margin:0 0 6px;font-size:30px;letter-spacing:7px;font-weight:700">${kode}</p>
    <p style="margin:0 0 28px;font-size:13px;color:#8a8378">Gyldig i én time.</p>

    <a href="${lenke}" style="display:inline-block;padding:14px 22px;background:#1c1b19;color:#ffffff;text-decoration:none;border-radius:10px;font-size:16px;font-weight:600">Åpne BenchBoss</a>

    <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#8a8378">
      Åpner lenken feil app, skriv inn koden på benchboss.no i stedet.
    </p>
  </div>
</body></html>`
}
