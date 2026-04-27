import * as XLSX from 'xlsx'

/**
 * Export season data to an Excel file with two sheets:
 * 1. "Kamper" — one row per match with date, teams, referee, payer, amount
 * 2. "Oppsummering" — total per coach
 */
export function exportSeasonToExcel({ seasonName, matches, expenses, coaches, getCoachesForMatch }) {
  const wb = XLSX.utils.book_new()

  // Build coach lookup
  const coachMap = {}
  for (const c of coaches) {
    coachMap[c.id] = c.name
  }

  // Build expense lookup by match_id
  const expenseMap = {}
  for (const e of expenses) {
    expenseMap[e.match_id] = e
  }

  // ---- Sheet 1: Kamper ----
  const matchRows = matches
    .slice()
    .sort((a, b) => a.match_date.localeCompare(b.match_date) || (a.match_time || '').localeCompare(b.match_time || ''))
    .map(m => {
      const exp = expenseMap[m.id]
      const coachIds = getCoachesForMatch ? getCoachesForMatch(m.id) : []
      const coachNames = coachIds.map(id => coachMap[id]).filter(Boolean).join(', ')

      return {
        'Dato': m.match_date,
        'Kl.': (m.match_time || '').substring(0, 5),
        'Hjemmelag': m.home_team,
        'Bortelag': m.away_team,
        'Avdeling': m.division || '',
        'Runde': m.round || '',
        'Dommer': m.referee || '',
        'Trenere': coachNames,
        'Lagt ut av': exp ? (coachMap[exp.paid_by] || '') : '',
        'Beløp': exp ? exp.amount : ''
      }
    })

  const ws1 = XLSX.utils.json_to_sheet(matchRows)

  // Set column widths
  ws1['!cols'] = [
    { wch: 12 }, // Dato
    { wch: 6 },  // Kl.
    { wch: 22 }, // Hjemmelag
    { wch: 22 }, // Bortelag
    { wch: 10 }, // Avdeling
    { wch: 7 },  // Runde
    { wch: 14 }, // Dommer
    { wch: 22 }, // Trenere
    { wch: 14 }, // Lagt ut av
    { wch: 8 }   // Beløp
  ]

  XLSX.utils.book_append_sheet(wb, ws1, 'Kamper')

  // ---- Sheet 2: Oppsummering ----
  const summaryRows = coaches.map(c => {
    const coachExpenses = expenses.filter(e => e.paid_by === c.id)
    const total = coachExpenses.reduce((sum, e) => sum + e.amount, 0)
    return {
      'Trener': c.name,
      'Antall kamper betalt': coachExpenses.length,
      'Totalt lagt ut': total
    }
  }).sort((a, b) => b['Totalt lagt ut'] - a['Totalt lagt ut'])

  // Add a total row
  const grandTotal = expenses.reduce((sum, e) => sum + e.amount, 0)
  summaryRows.push({
    'Trener': 'TOTALT',
    'Antall kamper betalt': expenses.length,
    'Totalt lagt ut': grandTotal
  })

  const ws2 = XLSX.utils.json_to_sheet(summaryRows)
  ws2['!cols'] = [
    { wch: 16 }, // Trener
    { wch: 20 }, // Antall kamper betalt
    { wch: 16 }  // Totalt lagt ut
  ]

  XLSX.utils.book_append_sheet(wb, ws2, 'Oppsummering')

  // Download
  const filename = `Dommerutlegg ${seasonName || 'sesong'}.xlsx`
  XLSX.writeFile(wb, filename)
}
