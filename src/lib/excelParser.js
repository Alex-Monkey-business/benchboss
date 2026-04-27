import * as XLSX from 'xlsx'

const COLUMN_MAP = {
  'runde': 'round',
  'dato': 'match_date',
  'date': 'match_date',
  'dag': 'match_day',
  'klokka': 'match_time',
  'klokkeslett': 'match_time',
  'tid': 'match_time',
  'kl': 'match_time',
  'kl.': 'match_time',
  'time': 'match_time',
  'hjemmelag': 'home_team',
  'hjemme': 'home_team',
  'hjem': 'home_team',
  'lag hjemme': 'home_team',
  'lag (hjemme)': 'home_team',
  'home': 'home_team',
  'bortelag': 'away_team',
  'borte': 'away_team',
  'lag borte': 'away_team',
  'lag (borte)': 'away_team',
  'away': 'away_team',
  'avdeling': 'division',
  'avd': 'division',
  'avd.': 'division',
  'turnering': 'division',
  'dommer': 'referee',
  'dommere': 'referee'
}

function normalizeColumnName(name) {
  return (name || '').toString().toLowerCase().trim()
}

function parseDate(value) {
  if (!value) return null

  // Excel serial date number
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    if (date) {
      const month = String(date.m).padStart(2, '0')
      const day = String(date.d).padStart(2, '0')
      return `${date.y}-${month}-${day}`
    }
  }

  const str = value.toString().trim()

  // "30-Apr" format (no year) - assume current year
  const monthNameMatch = str.match(/^(\d{1,2})[-.](\w+)$/)
  if (monthNameMatch) {
    const day = monthNameMatch[1].padStart(2, '0')
    const monthName = monthNameMatch[2].toLowerCase()
    const months = {
      'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
      'mai': '05', 'may': '05', 'jun': '06', 'jul': '07',
      'aug': '08', 'sep': '09', 'okt': '10', 'oct': '10',
      'nov': '11', 'des': '12', 'dec': '12'
    }
    const month = months[monthName.substring(0, 3)]
    if (month) {
      const year = new Date().getFullYear()
      return `${year}-${month}-${day}`
    }
  }

  // "DD.MM.YYYY" or "DD/MM/YYYY"
  const dotMatch = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/)
  if (dotMatch) {
    const year = dotMatch[3].length === 2 ? '20' + dotMatch[3] : dotMatch[3]
    return `${year}-${dotMatch[2].padStart(2, '0')}-${dotMatch[1].padStart(2, '0')}`
  }

  // "YYYY-MM-DD" (already ISO)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str

  return str
}

function parseTime(value) {
  if (!value) return null

  // Excel time as decimal (0.75 = 18:00)
  if (typeof value === 'number' && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  const str = value.toString().trim()

  // "18:00" or "18.00"
  const timeMatch = str.match(/^(\d{1,2})[:.](\d{2})/)
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
  }

  return str
}

/**
 * Detect season name from match dates.
 * Vinter = Nov–Mar, Vår = Apr–Jul, Høst = Aug–Oct
 * Uses the majority month to determine season, with the year of that majority.
 */
export function detectSeasonName(matches) {
  const dates = matches
    .map(m => m.match_date)
    .filter(Boolean)
    .map(d => new Date(d))
    .filter(d => !isNaN(d))

  if (dates.length === 0) return null

  // Count months
  const monthCounts = {}
  for (const d of dates) {
    const m = d.getMonth() + 1 // 1-12
    monthCounts[m] = (monthCounts[m] || 0) + 1
  }

  // Find majority month
  const majorityMonth = Number(Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0][0])

  // Determine season type
  let seasonType
  if (majorityMonth >= 11 || majorityMonth <= 3) {
    seasonType = 'Vinter'
  } else if (majorityMonth >= 4 && majorityMonth <= 7) {
    seasonType = 'Vår'
  } else {
    seasonType = 'Høst'
  }

  // Determine year: for Vinter, use the year of the latest date in the season
  // (e.g. Nov 2025–Mar 2026 → "Vinter 2026")
  const sorted = [...dates].sort((a, b) => a - b)
  let year
  if (seasonType === 'Vinter') {
    // Use the year that contains Jan–Mar dates, or the latest year
    const springDates = sorted.filter(d => d.getMonth() + 1 <= 3)
    year = springDates.length > 0 ? springDates[0].getFullYear() : sorted[sorted.length - 1].getFullYear() + 1
  } else {
    year = sorted[Math.floor(sorted.length / 2)].getFullYear()
  }

  return `${seasonType} ${year}`
}

export function parseMatchFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array', cellDates: false })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rawRows = XLSX.utils.sheet_to_json(sheet, { raw: true })

        if (rawRows.length === 0) {
          resolve([])
          return
        }

        // Map columns
        const firstRow = rawRows[0]
        const columnMapping = {}
        for (const key of Object.keys(firstRow)) {
          const normalized = normalizeColumnName(key)
          if (COLUMN_MAP[normalized]) {
            columnMapping[key] = COLUMN_MAP[normalized]
          }
        }

        const matches = rawRows
          .map(row => {
            const match = {}
            for (const [originalKey, mappedKey] of Object.entries(columnMapping)) {
              match[mappedKey] = row[originalKey]
            }
            return match
          })
          .filter(m => m.home_team && m.away_team)
          .map(m => ({
            round: m.round ? String(m.round) : null,
            match_date: parseDate(m.match_date),
            match_day: m.match_day || null,
            match_time: parseTime(m.match_time),
            home_team: String(m.home_team || '').trim(),
            away_team: String(m.away_team || '').trim(),
            division: m.division ? String(m.division).trim() : null,
            referee: m.referee ? String(m.referee).trim() : null,
            fee_amount: 200
          }))
          .filter(m => m.match_date)

        resolve(matches)
      } catch (err) {
        reject(err)
      }
    }

    reader.onerror = () => reject(new Error('Kunne ikke lese filen'))
    reader.readAsArrayBuffer(file)
  })
}
