// The statutory calendar a payroll person works to (docs/pm/PAYROLL_PLAN.md),
// as dated items for the Payroll dashboard's deadlines rail. Pure: a date in,
// dates out, every date a "YYYY-MM-DD" string so there is no time zone to
// get wrong.
//
// For each wage month:
//  - salary by the pay day of the next month (the 7th by default; Code on Wages s.17),
//  - TDS deposited by the 7th of the next month, except March's, due 30 April,
//  - EPF (ECR + challan) and ESI by the 15th of the next month,
//  - Delhi LWF, half-yearly: June's by 15 July, December's by 15 January.
// For each financial year:
//  - Form 138 (the quarterly salary TDS statement, 24Q before the Income-tax
//    Act 2025) by 31 July, 31 October, 31 January and 31 May,
//  - Form 130 (Form 16 before the 2025 Act) to every employee by 15 June.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

const pad = (n) => String(n).padStart(2, "0")
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

/** [year, month] of the month after (1-based months). */
function next(y, m) {
  return m === 12 ? [y + 1, 1] : [y, m + 1]
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

function addDays(day, n) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
}

const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** "September 2026" from a year and 1-based month. */
export const wageMonthLabel = (y, m) => `${LONG[m - 1]} ${y}`

/**
 * The dues arising from one wage month ("YYYY-MM" or any date in it).
 * `payDay` is the schedule's pay day (Settings), clamped to the month.
 */
export function deadlinesForWageMonth(month, { payDay = 7 } = {}) {
  const [y, m] = String(month).slice(0, 7).split("-").map(Number)
  const [ny, nm] = next(y, m)
  const label = wageMonthLabel(y, m)
  const period = `${y}-${pad(m)}`
  const day = Math.min(Math.max(1, Number(payDay) || 7), lastDay(ny, nm))
  const out = [
    { key: `salary:${period}`, kind: "salary", title: "Pay salaries", period, due: ymd(ny, nm, day), detail: `${label} salaries reach bank accounts` },
    {
      key: `tds:${period}`,
      kind: "tds",
      title: "Deposit TDS",
      period,
      // March's TDS may be deposited up to 30 April.
      due: m === 3 ? ymd(y, 4, 30) : ymd(ny, nm, 7),
      detail: `Income tax deducted from ${label} salaries (challan 281)`,
    },
    { key: `pf:${period}`, kind: "pf", title: "File EPF ECR and pay", period, due: ymd(ny, nm, 15), detail: `${label} PF contributions on the EPFO portal` },
    { key: `esi:${period}`, kind: "esi", title: "Pay ESI", period, due: ymd(ny, nm, 15), detail: `${label} ESI contributions on the ESIC portal` },
  ]
  if (m === 6 || m === 12) {
    out.push({
      key: `lwf:${period}`,
      kind: "lwf",
      title: "Pay Delhi LWF",
      period,
      due: ymd(ny, nm, 15),
      detail: `Labour welfare fund for the half year to ${label}`,
    })
  }
  return out
}

/** The yearly returns of the financial year starting in April of `fyStart`. */
export function deadlinesForFy(fyStart) {
  const y = Number(fyStart)
  const fy = `${y}-${pad((y + 1) % 100)}`
  const q = (n, due, span) => ({
    key: `form138:${fy}:Q${n}`,
    kind: "form138",
    title: `File Form 138, Q${n}`,
    period: fy,
    due,
    detail: `Quarterly salary TDS statement for ${span} (formerly 24Q)`,
  })
  return [
    q(1, ymd(y, 7, 31), `April to June ${y}`),
    q(2, ymd(y, 10, 31), `July to September ${y}`),
    q(3, ymd(y + 1, 1, 31), `October to December ${y}`),
    q(4, ymd(y + 1, 5, 31), `January to March ${y + 1}`),
    {
      key: `form130:${fy}`,
      kind: "form130",
      title: "Issue Form 130",
      period: fy,
      due: ymd(y + 1, 6, 15),
      detail: `Salary TDS certificate for FY ${fy} to every employee (formerly Form 16)`,
    },
  ]
}

/**
 * Everything due from `today` (inclusive) to `days` later, soonest first, each
 * with `daysLeft`. `today` is "YYYY-MM-DD".
 */
export function upcomingDeadlines(today, { payDay = 7, days = 45 } = {}) {
  const day = String(today).slice(0, 10)
  const end = addDays(day, days)
  const [y, m] = day.split("-").map(Number)
  const items = []
  // Wage months whose dues can land in the window: from a quarter back.
  let cy = y
  let cm = m
  for (let i = 0; i < 4; i++) [cy, cm] = cm === 1 ? [cy - 1, 12] : [cy, cm - 1]
  for (let i = 0; i < 6; i++) {
    items.push(...deadlinesForWageMonth(`${cy}-${pad(cm)}`, { payDay }))
    ;[cy, cm] = next(cy, cm)
  }
  const fy = m >= 4 ? y : y - 1
  items.push(...deadlinesForFy(fy - 1), ...deadlinesForFy(fy), ...deadlinesForFy(fy + 1))
  const seen = new Set()
  return items
    .filter((d) => d.due >= day && d.due <= end && !seen.has(d.key) && seen.add(d.key))
    .map((d) => ({ ...d, daysLeft: daysBetween(day, d.due) }))
    .sort((a, b) => (a.due === b.due ? a.key.localeCompare(b.key) : a.due < b.due ? -1 : 1))
}

/** "Due today" / "Due tomorrow" / "In 5 days". */
export function dueWords(daysLeft) {
  if (daysLeft <= 0) return "Due today"
  if (daysLeft === 1) return "Due tomorrow"
  return `In ${daysLeft} days`
}

/** "15 Oct" from "YYYY-MM-DD". */
export const shortDate = (day) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`
