// Hent på forhånd det neste skjermbilde trenger, mens telefonen står stille.
// Da tegnes skjermen i første bilde i stedet for å fylles etter ett kall.
// Feil svelges: forvarming er en snarvei, aldri en forutsetning.
export function narLedig(fn) {
  const kjor = () => { try { Promise.resolve(fn()).catch(() => {}) } catch { /* ok */ } }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(kjor, { timeout: 2000 })
  else setTimeout(kjor, 300)
}
