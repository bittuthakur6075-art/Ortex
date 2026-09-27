// Turns a sales team's enquiry sheet (the "Ortex Corporate.xlsx" call log:
// Date, Name, Mobile No., Status, Mobile No.2, Type of Product, Quantity, Rate,
// City, company Name, Email id) into enquiry docs. Pure: the caller reads the
// workbook (SheetJS `sheet_to_json(ws, { header: 1, defval: "", raw: true })`)
// and inserts the result. Line-for-line mirror of
// Ortex.Admin/src/lib/enquiryImport.js: edit both.

type Cell = string | number | boolean | null | undefined
type Columns = Partial<Record<ColumnKey, number>>
type ColumnKey = "date" | "phone2" | "phone" | "name" | "status" | "product" | "quantity" | "rate" | "city" | "company" | "email"

export type ImportedEnquiry = {
  source: string
  status: string
  starred: boolean
  owner: string
  customer: {
    name: string
    company: string
    email: string
    phone: string
    gstin: string
    stateCode: string
    address: string
    city: string
  }
  productInterest: string
  quantity: string
  rate: string
  altPhone: string
  message: string
  notes: string
  imported: { file: string; row: number }
  createdAt?: string
}

const HEADERS: [ColumnKey, RegExp][] = [
  ["date", /^date|^day$/],
  ["phone2", /mobile\s*no\.?\s*2|alt(ernate)?\s*(mobile|phone|no)|phone\s*2|mobile\s*2/],
  ["phone", /^(mobile|phone|contact)(\s*(no|number)\.?)?$/],
  ["name", /^(customer\s*)?name$/],
  ["status", /^status|^remark/],
  ["product", /product|item/],
  ["quantity", /^qty|quantity/],
  ["rate", /^rate|^price/],
  ["city", /^city|location/],
  ["company", /company|firm|business/],
  ["email", /e-?mail/],
]

const norm = (v: Cell) => String(v ?? "").replace(/\s+/g, " ").trim()
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i
const DAY = 86400000

/** Which column holds what, from the header row. Column A with no header is the date. */
export function mapColumns(header: Cell[]): Columns {
  const cols: Columns = {}
  header.forEach((h, i) => {
    const text = norm(h).toLowerCase()
    if (!text) return
    const hit = HEADERS.find(([key, re]) => cols[key] === undefined && re.test(text))
    if (hit) cols[hit[0]] = i
  })
  if (cols.date === undefined && !norm(header[0]) && cols.name !== 0) cols.date = 0
  return cols
}

/** The header row: the first of the top five that names both a name and a mobile column. */
export function findHeaderRow(rows: Cell[][]): number {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const c = mapColumns(rows[i] || [])
    if (c.name !== undefined && c.phone !== undefined) return i
  }
  return -1
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const utc = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t : null
}

/**
 * A date cell as "YYYY-MM-DD", or null. Text is DD/MM/YY(YY). An Excel date
 * number is often a DD/MM entry that Excel read as MM/DD, so when both readings
 * exist the one nearer the previous row's date wins (the log is chronological).
 * Anything before 2020 or in the future is refused.
 */
export function parseDate(v: Cell, prev: string | null, today = new Date()): string | null {
  const ok = (d: Date | null): d is Date => !!d && d.getUTCFullYear() >= 2020 && d.getTime() <= today.getTime() + DAY
  let options: (Date | null)[] = []
  if (typeof v === "number" && v > 30000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * DAY)
    options = [d, d.getUTCDate() <= 12 ? utc(d.getUTCFullYear(), d.getUTCDate(), d.getUTCMonth() + 1) : null]
  } else {
    const m = norm(v).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
    if (m) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
      options = [utc(y, Number(m[2]), Number(m[1]))]
    }
  }
  const valid = options.filter(ok)
  if (!valid.length) return null
  if (prev && valid.length > 1) {
    const p = new Date(prev).getTime()
    valid.sort((a, b) => Math.abs(a.getTime() - p) - Math.abs(b.getTime() - p))
  }
  return ymd(valid[0])
}

/** "4l" → 400000, "2.5k" → 2500, "2000+" → 2000, "10,000" → 10000; else null. */
export function parseQuantity(v: Cell): number | null {
  if (typeof v === "number") return v > 0 ? v : null
  const m = norm(v).toLowerCase().replace(/,/g, "").match(/^([\d.]+)\s*(k|l|lac|lakh|lakhs)?\s*\+?\s*(pcs|nos|pieces)?$/)
  if (!m) return null
  const n = Number(m[1]) * (m[2] === "k" ? 1000 : m[2] ? 100000 : 1)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/** A 10-digit Indian mobile from whatever was typed, or null. */
export function parsePhone(v: Cell): string | null {
  const d = String(v ?? "").replace(/\D/g, "")
  const ten = d.length === 12 && d.startsWith("91") ? d.slice(2) : d.length === 11 && d.startsWith("0") ? d.slice(1) : d
  return /^[6-9]\d{9}$/.test(ten) ? ten : null
}

/** The console's six enquiry statuses from the team's own words. */
export function mapStatus(text: string): string {
  const s = norm(text).toLowerCase()
  if (!s) return "new"
  if (/cancel|not interested|not required|no need|wrong|not exist|locally|already (taken|given)|order to other|other vendor/.test(s)) return "lost"
  if (/order (received|done|finished|given|accepted|confirm)|\bordered\b|final order|today order|payment received|^confirm(ed)?$/.test(s)) return "won"
  if (/waiting for (order|confirm|client)|waiting confirm|order (by|on|in|tomorrow|today)|pi given|price final|sample (order|dispatched|pass)|confirm on/.test(s)) return "qualified"
  if (/price|rate given|quotation|design|sample/.test(s)) return "quoted"
  return "contacted"
}

const phoneKey = (p: unknown) => String(p || "").replace(/\D/g, "").slice(-10)
// The IST calendar day: the database returns created_at in UTC, so a lead saved
// before 05:30 IST would otherwise land on the day before.
const istDay = (ts: unknown) => {
  const t = Date.parse(String(ts ?? ""))
  return Number.isFinite(t) ? new Date(t + 5.5 * 3600000).toISOString().slice(0, 10) : ""
}
type Keyed = { createdAt?: unknown; customer?: { phone?: string; name?: string }; productInterest?: string }
/**
 * Same person (mobile, else name), same product, same IST day: the key a
 * re-import is skipped on. A row with no date keys with an empty day.
 */
export function enquiryKey(e: Keyed): string {
  const who = phoneKey(e.customer?.phone) || norm(e.customer?.name).toLowerCase()
  return `${who}|${norm(e.productInterest).toLowerCase()}|${istDay(e.createdAt)}`
}
const undated = (key: string) => key.slice(0, key.lastIndexOf("|") + 1)

export type SheetResult = {
  enquiries: ImportedEnquiry[]
  skipped: { row: number; reason: string }[]
  repeats: { row: number; name: string }[]
  columns: Columns | null
  headerRow: number
  error?: string
}

/**
 * Rows (header included) to enquiry docs.
 * `existing` enquiries skip the rows already in the console; `repeats` are the
 * rows whose mobile is already a lead (another product or day), for a person
 * to decide on.
 */
export function sheetToEnquiries(
  rows: Cell[][],
  { source = "Phone", fileName = "", existing = [] as Keyed[], today = new Date() } = {},
): SheetResult {
  const headerRow = findHeaderRow(rows)
  if (headerRow < 0) return { enquiries: [], skipped: [], repeats: [], columns: null, headerRow, error: "No header row with a Name and a Mobile column in the first five rows." }
  const header = rows[headerRow]
  const columns = mapColumns(header)
  const known = new Set(Object.values(columns))
  const enquiries: ImportedEnquiry[] = []
  const skipped: { row: number; reason: string }[] = []
  let date: string | null = null

  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] || []
    const cell = (key: ColumnKey): Cell => (columns[key] === undefined ? "" : r[columns[key] as number])
    const rowNo = i + 1
    if (columns.date !== undefined && norm(cell("date"))) {
      // The log runs forwards: a date a month or more before the last one is a typo.
      const d = parseDate(cell("date"), date, today)
      if (d && !(date && new Date(d).getTime() < new Date(date).getTime() - 31 * DAY)) date = d
    }

    const name = norm(cell("name"))
    const phoneRaw = norm(cell("phone"))
    const product = norm(cell("product"))
    if (!name && !phoneRaw && !product) continue
    if (!name && !phoneRaw) {
      skipped.push({ row: rowNo, reason: "No name or mobile" })
      continue
    }

    const notes: string[] = []
    const status = norm(cell("status"))
    if (status) notes.push(`Status: ${status}`)

    const phone = parsePhone(cell("phone"))
    if (!phone && phoneRaw) notes.push(`Mobile as written: ${phoneRaw}`)

    // "Mobile No.2" doubles as a second notes column in practice.
    let altPhone = ""
    const second = cell("phone2")
    if (norm(second)) {
      const alt = parsePhone(second)
      if (alt) altPhone = alt
      else if (typeof second === "number" && second > 30000 && second < 80000) notes.push(`Follow up: ${parseDate(second, date, new Date(8.64e15)) || second}`)
      else notes.push(`Note: ${norm(second)}`)
    }

    const qtyRaw = norm(cell("quantity"))
    const qty = parseQuantity(cell("quantity"))
    const qtyHasNumber = /\d/.test(qtyRaw)
    if (!qty && qtyRaw && !qtyHasNumber) notes.push(`Quantity column: ${qtyRaw}`)
    const email = norm(cell("email"))
    if (email && !EMAIL_RE.test(email)) notes.push(`Email column: ${email}`)

    // Anything in columns without a heading (a spec, a second email) is kept.
    r.forEach((v, c) => {
      if (!known.has(c) && norm(v) && !norm(header[c])) notes.push(norm(v))
      else if (!known.has(c) && norm(v)) notes.push(`${norm(header[c])}: ${norm(v)}`)
    })

    const enquiry: ImportedEnquiry = {
      source,
      status: mapStatus(`${status} ${typeof second === "string" ? second : ""}`),
      starred: false,
      owner: "",
      customer: {
        name: name || "Unknown",
        company: norm(cell("company")),
        email: email && EMAIL_RE.test(email) ? email.toLowerCase() : "",
        phone: phone || phoneRaw,
        gstin: "",
        stateCode: "",
        address: "",
        city: norm(cell("city")),
      },
      productInterest: product,
      quantity: qty ? String(qty) : qtyHasNumber ? qtyRaw : "",
      rate: norm(cell("rate")),
      altPhone,
      message: "",
      notes: notes.join("\n"),
      imported: { file: fileName, row: rowNo },
      ...(date ? { createdAt: `${date}T10:00:00+05:30` } : {}),
    }

    enquiries.push(enquiry)
  }
  // Rows above the first dated row belong to that first day.
  const first = enquiries.find((e) => e.createdAt)?.createdAt
  if (first) for (const e of enquiries) if (!e.createdAt) e.createdAt = first

  // Duplicates are judged on the final dates. A sheet with no dates at all
  // matches on person and product alone, since its rows are saved as "now".
  const inConsole = new Set<string>()
  const leads = new Map<string, string>() // mobile -> name on the lead already in the console
  for (const e of existing) {
    const key = enquiryKey(e)
    inConsole.add(key).add(undated(key))
    const phone = phoneKey(e.customer?.phone)
    if (phone.length === 10 && !leads.has(phone)) leads.set(phone, norm(e.customer?.name) || "Unknown")
  }
  const inFile = new Set<string>()
  const kept: ImportedEnquiry[] = []
  const repeats: { row: number; name: string }[] = []
  for (const e of enquiries) {
    const key = enquiryKey(e)
    if (inConsole.has(key)) skipped.push({ row: e.imported.row, reason: "Already in the console" })
    else if (inFile.has(key)) skipped.push({ row: e.imported.row, reason: "Repeated in this file" })
    else {
      inFile.add(key)
      kept.push(e)
      const lead = leads.get(phoneKey(e.customer.phone))
      if (lead) repeats.push({ row: e.imported.row, name: lead })
    }
  }
  skipped.sort((a, b) => a.row - b.row)
  return { enquiries: kept, skipped, repeats, columns, headerRow }
}
