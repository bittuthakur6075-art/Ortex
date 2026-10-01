// Turns a UPI / bank-transfer screenshot into a payment draft the person checks
// before saving. No language model is involved and the image never leaves the
// browser:
//
//   1. pages/invoices/ScreenshotReader.jsx cleans the image (greyscale, dark mode
//      inverted, upscaled, Otsu threshold) and runs Tesseract's LSTM recogniser
//      on it, in a web worker, to get the printed text.
//   2. parseReceiptText() below reads the fields out of that text by the labels
//      Indian payment apps and banks print ("UPI Ref No", "UTR", "Paid to", ...).
//   3. normalizeReading() picks the real reference, the method and the warnings;
//      findDuplicate() and matchInvoice() check the ledger and the open invoices.
//
// All of it is plain, tested rules (paymentReader.test.js). Nothing is saved from
// here: the form shows the draft and the warnings, and a person edits and confirms.

import { round2 } from "./format"

const DAY = 86400000

/** "₹1,23,456.50", "Rs. 500", 500 -> 123456.5 / 500; anything else -> null. */
export function parseAmount(v) {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? round2(v) : null
  const m = String(v ?? "").replace(/,/g, "").match(/\d+(?:\.\d{1,2})?/)
  const n = m ? Number(m[0]) : NaN
  return n > 0 ? round2(n) : null
}

const alnum = (s) => String(s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "")

/**
 * What a reference looks like, by the formats Indian payment rails print:
 *  - RTGS UTR: 22 characters, 4-letter bank code then "R" (SBINR52026093000012345)
 *  - NEFT UTR: 16 characters, 4-letter bank code then "N" (HDFCN52026093012)
 *  - UPI / IMPS RRN: exactly 12 digits
 */
export function referenceKind(ref) {
  const r = alnum(ref)
  if (/^[A-Z]{4}R[0-9A-Z]{17}$/.test(r)) return "rtgs"
  if (/^[A-Z]{4}N[0-9A-Z]{11}$/.test(r)) return "neft"
  if (/^\d{12}$/.test(r)) return "rrn"
  return r.length >= 6 ? "other" : null
}

const KIND_RANK = { rtgs: 3, neft: 3, rrn: 2, other: 1 }

/** The reference worth keeping: a real UTR / RRN beats an app's own order id. */
export function pickReference(primary, others = []) {
  const all = [primary, ...others].map((r) => String(r ?? "").trim()).filter(Boolean)
  let best = ""
  let bestRank = 0
  for (const r of all) {
    const rank = KIND_RANK[referenceKind(r)] || 0
    if (rank > bestRank) {
      best = r.replace(/\s+/g, "")
      bestRank = rank
    }
  }
  return best
}

/** The console's PAYMENT_METHODS label for what the screenshot shows. */
export function methodFor(method, reference) {
  const m = String(method ?? "").toUpperCase()
  const kind = referenceKind(reference)
  if (m === "RTGS" || kind === "rtgs") return "RTGS"
  if (m === "NEFT" || m === "IMPS" || kind === "neft") return "Bank transfer / NEFT"
  if (m === "UPI") return "UPI"
  if (m === "CHEQUE") return "Cheque"
  if (m === "CARD") return "Card"
  // A bare 12-digit RRN with no other clue is almost always UPI.
  if (kind === "rrn") return "UPI"
  return "Other"
}

/** A date we can trust: parsed, not in the future, not years old. */
export function parsePaidAt(v, now = Date.now()) {
  if (!v) return null
  const t = new Date(v).getTime()
  if (Number.isNaN(t) || t > now + DAY || t < now - 2 * 365 * DAY) return null
  return new Date(t).toISOString()
}

/**
 * The raw reading -> the fields of the payment form, plus warnings.
 * `type` is the form's: "inflow" keeps the payer, "payout" the payee.
 */
export function normalizeReading(raw, { type = "inflow", now = Date.now() } = {}) {
  const r = raw || {}
  const reference = pickReference(r.reference, r.otherRefs)
  const amount = parseAmount(r.amount)
  const date = parsePaidAt(r.paidAt, now)
  const payer = String(r.payerName || "").trim()
  const payee = String(r.payeeName || "").trim()
  const party = type === "payout" ? payee : payer
  const status = ["success", "pending", "failed"].includes(r.status) ? r.status : "unknown"
  const confidence = Math.min(Math.max(Number(r.confidence) || 0, 0), 1)

  const warnings = []
  if (r.isPaymentProof === false) warnings.push("Not a payment screenshot.")
  if (status === "failed") warnings.push("This payment failed.")
  if (status === "pending") warnings.push("This payment is still pending.")
  if (!amount) warnings.push("Amount not found. Enter it.")
  const amountAlt = amount ? parseAmount(r.amountAlt) : null
  if (amountAlt) warnings.push(`Check the amount: ₹${amount.toLocaleString("en-IN")} or ₹${amountAlt.toLocaleString("en-IN")}?`)
  if (!reference) warnings.push("No UTR or reference found.")
  if (r.paidAt && !date) warnings.push("Date unclear. Check it.")
  if (r.currency && String(r.currency).toUpperCase() !== "INR") warnings.push(`Amount is in ${r.currency}, not ₹.`)
  if (confidence && confidence < 0.6) warnings.push("Hard to read. Check every field.")

  const note = [r.app && `Paid by ${r.app}`, r.note && `remark "${String(r.note).trim()}"`].filter(Boolean).join(", ")

  return {
    amount,
    amountAlt,
    date,
    method: methodFor(r.method, reference),
    reference,
    party,
    note: note.slice(0, 200),
    remark: String(r.note || ""),
    status,
    confidence,
    warnings,
    // Failed, or not a payment at all: shown in red, and saving asks first.
    serious: status === "failed" || r.isPaymentProof === false,
  }
}

/** An entry already in the ledger for the same money, and how sure we are. */
export function findDuplicate(draft, payments = []) {
  const ref = alnum(draft.reference)
  if (ref.length >= 6) {
    const same = payments.find((p) => alnum(p.reference) === ref)
    if (same) return { payment: same, sure: true }
  }
  if (draft.amount && draft.date) {
    const day = draft.date.slice(0, 10)
    const near = payments.find(
      (p) =>
        p.type === (draft.type || "inflow") &&
        round2(p.amount) === draft.amount &&
        String(p.date || "").slice(0, 10) === day &&
        (!draft.party || nameScore(draft.party, p.party || p.customer?.name) >= 0.5),
    )
    if (near) return { payment: near, sure: false }
  }
  return null
}

const STOP = new Set(["mr", "mrs", "ms", "m", "s", "pvt", "ltd", "private", "limited", "llp", "and", "the", "co", "company", "india", "industries", "enterprises", "traders"])
const tokens = (s) => new Set(String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)))

/** 0..1 overlap of the meaningful words in two names ("RAHUL K SHARMA" vs "Rahul Sharma" = 1). */
export function nameScore(a, b) {
  const A = tokens(a)
  const B = tokens(b)
  if (!A.size || !B.size) return 0
  let hit = 0
  for (const w of A) if (B.has(w)) hit++
  return hit / Math.min(A.size, B.size)
}

/**
 * The open invoice this payment most likely settles, or null.
 * `open` is [{ inv, balance }] as the payment form builds it. A score needs two
 * signals to win (amount and name, or the invoice number written in the remark),
 * and a tie is no answer: the person picks.
 */
export function matchInvoice(draft, open = []) {
  const remark = alnum(draft.remark)
  const scored = open.map(({ inv, balance }) => {
    let score = 0
    const why = []
    const total = round2(inv.totals?.grandTotal || 0)
    if (draft.amount && Math.abs(draft.amount - balance) < 1) {
      score += 0.6
      why.push("amount equals the balance due")
    } else if (draft.amount && Math.abs(draft.amount - total) < 1) {
      score += 0.5
      why.push("amount equals the invoice total")
    }
    const name = Math.max(nameScore(draft.party, inv.customer?.name), nameScore(draft.party, inv.customer?.company))
    if (name >= 0.5) {
      score += 0.4 * name
      why.push("payer name matches the customer")
    }
    const num = alnum(inv.number)
    if (num.length >= 4 && remark.includes(num)) {
      score += 0.7
      why.push("invoice number is in the remark")
    }
    return { inv, score: round2(score), why }
  })
  scored.sort((a, b) => b.score - a.score)
  const [best, next] = scored
  if (!best || best.score < 0.7) return null
  if (next && best.score - next.score < 0.15) return null
  return best
}

// ---- Image: the threshold that separates text from background ----

/**
 * Otsu's method: the grey level (0..255) that best splits a 256-bin histogram
 * into two classes (text and background), by maximising the variance between
 * them. Used on the screenshot before recognition.
 */
// ponytail: one global threshold; a coloured banner with light text can wash out, switch to Sauvola (local) thresholds if that shows up.
export function otsuThreshold(hist) {
  let total = 0
  let sum = 0
  for (let i = 0; i < 256; i++) {
    total += hist[i]
    sum += i * hist[i]
  }
  let sumB = 0
  let wB = 0
  let best = -1
  let threshold = 127
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += i * hist[i]
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2
    if (between > best) {
      best = between
      threshold = i
    }
  }
  return threshold
}

// ---- Text: the fields of a receipt, from what OCR read ----

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
const MON = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*"
const pad = (n) => String(n).padStart(2, "0")

/** The first date (and the time beside it) printed, as ISO in IST; "" if none. */
export function parseReceiptDate(text) {
  const t = String(text || "").replace(/\s+/g, " ")
  let y, mo, d, m
  if ((m = t.match(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*${MON}[\s,'-]*(\d{4}|\d{2})\b`, "i")))) {
    ;[d, mo, y] = [+m[1], MONTHS[m[2].toLowerCase()], +m[3]]
  } else if ((m = t.match(new RegExp(String.raw`\b${MON}\s+(\d{1,2}),?\s+(\d{4})\b`, "i")))) {
    ;[mo, d, y] = [MONTHS[m[1].toLowerCase()], +m[2], +m[3]]
  } else if ((m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) {
    ;[y, mo, d] = [+m[1], +m[2] - 1, +m[3]]
  } else if ((m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/))) {
    // Indian banks print day first.
    ;[d, mo, y] = [+m[1], +m[2] - 1, +m[3]]
  } else return ""
  if (y < 100) y += 2000
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return ""

  // The time beside the date: after it ("30 Sep 2026, 6:42 pm") or, as PhonePe
  // prints it, before ("02:15 pm on 29 Sep 2026").
  const TIME = /(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(am|pm)?/i
  const end = m.index + m[0].length
  const tm = t.slice(end, end + 25).match(TIME) || t.slice(Math.max(0, m.index - 25), m.index).match(TIME)
  let h = 12
  let min = 0
  if (tm) {
    h = +tm[1] % 24
    min = +tm[2]
    if (tm[3]?.toLowerCase() === "pm" && h < 12) h += 12
    if (tm[3]?.toLowerCase() === "am" && h === 12) h = 0
  }
  return `${y}-${pad(mo + 1)}-${pad(d)}T${pad(h)}:${pad(min)}:00+05:30`
}

/**
 * OCR's usual confusions inside a number: O for 0, I / l / | for 1, S for 5,
 * B for 8. Applied only to a token that is mostly digits already, so a UTR's
 * bank letters ("HDFC") are left alone.
 */
export function fixDigits(token) {
  const s = String(token || "")
  const digits = (s.match(/\d/g) || []).length
  if (!s || digits / s.length < 0.7) return s
  return s.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/S/g, "5").replace(/B/g, "8")
}

// Indian digit grouping: 900, 11,800, 2,36,000, 11800.00.
const INDIAN = /^(?:\d{1,3}|\d{1,2}(?:,\d{2})*,\d{3}|\d{1,7})(?:\.\d{1,2})?$/

/**
 * A line that is only an amount, as apps print the big headline figure, ->
 * { amount, alt } or null. OCR often turns the ₹ glyph into a symbol (%, &) or
 * a digit (3, 2, 7, 8) stuck to the number:
 *  - "311,800": Indian apps never group a number that way (it would be
 *    "3,11,800"), so the 3 was the rupee sign: 11,800, certain.
 *  - "31,200": both 31,200 and 1,200 are valid. Tesseract's confidence in the
 *    word decides (a misread glyph pulls it down), and `alt` keeps the other
 *    reading for the person to pick with one click.
 * `wordConf` is Tesseract's 0..100 for this word. `bare` accepts a number with no comma
 * or decimals ("453"): only for the line printed in the largest font, since
 * elsewhere a bare number is as likely a phone number or a pincode.
 */
export function headlineAmount(line, wordConf = 100, bare = false) {
  const s = String(line || "").replace(/\s+/g, "")
  if (!/^[^\d,.]?[0-9,.]+$/.test(s)) return null
  const money = (v) => (bare || /[,.]/.test(v)) && INDIAN.test(v)
  const symbol = /^[^\d,.]/.test(s)
  const read = s.replace(/^[^\d,.]/, "")
  const glyph = /^[2378]/.test(read) && money(read.slice(1)) ? read.slice(1) : ""
  if (!money(read)) return glyph ? { amount: parseAmount(glyph), alt: null } : null
  // A symbol already stood for the ₹, or the digit is not one it turns into.
  if (symbol || !glyph || wordConf >= 90) return { amount: parseAmount(read), alt: null }
  const [amount, alt] = wordConf < 75 ? [glyph, read] : [read, glyph]
  return { amount: parseAmount(amount), alt: parseAmount(alt) }
}

/** The value after a label on the same line, else the next line (apps print both ways). */
function labelled(lines, re) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re)
    if (!m) continue
    const rest = lines[i].slice(m.index + m[0].length).replace(/^[\s:#.-]+/, "").trim()
    if (rest) return rest
    if (lines[i + 1]) return lines[i + 1].trim()
  }
  return ""
}

const REF_LABEL = /\b(?:utr|rrn|upi\s*ref(?:erence)?|bank\s*ref(?:erence)?|ref(?:erence)?\s*(?:no|number|id)|transaction\s*(?:id|ref(?:erence)?|no|number)|txn\s*(?:id|no))\b\.?(?:\s*(?:no|number|id)\b\.?)?/i
// The wording of Google Pay, PhonePe, Paytm, BHIM, Amazon Pay, CRED, WhatsApp, MobiKwik and the bank apps.
const PAYEE_LABEL = /^(?:paid\s+(?:successfully\s+)?to|(?:money\s+)?sent\s+(?:successfully\s+)?to|transferred\s+to|payment\s+to|to|beneficiary(?:\s+name)?|payee(?:\s+name)?|receiver(?:\s+name)?|recipient)\b/i
const PAYER_LABEL = /^(?:from|received\s+from|paid\s+(?:by|from)|sent\s+by|payer(?:\s+name)?|sender(?:\s+name)?|remitter(?:\s+name)?)\b/i
const NOTE_LABEL = /^(?:message|remarks?|note|purpose|description|narration)\b/i
const AMOUNT_NOISE = /balance|cashback|reward|fee|charge|limit|avl|available/i
// ₹ often comes out of OCR as %, & or ¥.
const AMOUNT = /(?:₹|rs\.?|inr|[%&¥](?=\s?\d))\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i

// The app a screenshot came from: its name on screen first (the branding),
// then the sender's UPI handle (`@ybl` is PhonePe, `@okicici` Google Pay).
const APPS = [
  [/google\s*pay|\bg\s?pay\b/i, "Google Pay"],
  [/phone\s?pe/i, "PhonePe"],
  [/paytm/i, "Paytm"],
  [/amazon\s*pay/i, "Amazon Pay"],
  [/\bbhim\b/i, "BHIM"],
  [/\bcred\b/i, "CRED"],
  [/whatsapp/i, "WhatsApp Pay"],
  [/mobikwik/i, "MobiKwik"],
  [/freecharge/i, "Freecharge"],
  [/super\.?\s?money/i, "super.money"],
  [/\bnavi\b/i, "Navi"],
  [/jupiter/i, "Jupiter"],
  [/\bfi\s+money\b|\bfi\.money/i, "Fi"],
  [/\bslice\b/i, "slice"],
  [/\bpop\s+upi\b|\bpopclub\b/i, "POP"],
  [/\bkiwi\b/i, "Kiwi"],
  [/groww/i, "Groww"],
  [/airtel/i, "Airtel Thanks"],
  [/jio\s*(?:finance|pay)/i, "JioFinance"],
  [/payzapp/i, "HDFC PayZapp"],
  [/imobile/i, "ICICI iMobile"],
  [/\byono\b/i, "SBI YONO"],
  [/hdfc/i, "HDFC Bank"],
  [/icici/i, "ICICI Bank"],
  [/\bsbi\b|state bank/i, "SBI"],
  [/axis/i, "Axis Bank"],
  [/kotak/i, "Kotak Bank"],
]
const HANDLES = [
  [/@ok(?:icici|sbi|hdfcbank|axis)\b/i, "Google Pay"],
  [/@(?:ybl|ibl|axl)\b/i, "PhonePe"],
  [/@(?:paytm|pt(?:yes|axis|hdfc|sbi))\b/i, "Paytm"],
  [/@(?:apl|yapl|rapl)\b/i, "Amazon Pay"],
  [/@upi\b/i, "BHIM"],
  [/@axisb\b/i, "CRED"],
  [/@wa(?:icici|hdfcbank|sbi|axis)\b/i, "WhatsApp Pay"],
  [/@ikwik\b/i, "MobiKwik"],
  [/@freecharge\b/i, "Freecharge"],
  [/@superyes\b/i, "super.money"],
  [/@naviaxis\b/i, "Navi"],
  [/@jupiteraxis\b/i, "Jupiter"],
  [/@fifederal\b/i, "Fi"],
  [/@sliceaxis\b/i, "slice"],
  [/@yespop\b/i, "POP"],
]

/** The app, by name on screen, else by the handle on the sender's line(s). */
function appFor(all, lines) {
  // Not inside a UPI handle: "arjun@naviaxis" is Navi, not Axis Bank.
  const shown = all.replace(/\S+@\S+/g, " ")
  const named = APPS.find(([re]) => re.test(shown))?.[1]
  if (named) return named
  const i = lines.findIndex((l) => PAYER_LABEL.test(l))
  const near = i < 0 ? all : lines.slice(i, i + 3).join(" ")
  return HANDLES.find(([re]) => re.test(near))?.[1] || HANDLES.find(([re]) => re.test(all))?.[1] || ""
}

/** A person or business name: no UPI id, masked account, bank in brackets or stray symbols. */
function cleanName(s) {
  const out = String(s || "")
    .replace(/\(.*?\)/g, " ")
    .replace(/\S+@\S+/g, " ")
    .replace(/\b[xX*]{2,}\d+\b|\ba\/?c\b.*$/gi, " ")
    .replace(/[^A-Za-z ./&'-]/g, " ")
    .replace(BANK_TAIL, " ")
    .replace(/\s+/g, " ")
    .trim()
  return (out.match(/[A-Za-z]/g) || []).length >= 2 ? out.slice(0, 80) : ""
}

// Apps print the payer's bank after the name ("RAMSHANKAR THAKUR ICICI Bank"); it is not part of it.
const BANK_TAIL = /(?:^|\s)(?:icici|hdfc|sbi|axis|kotak|pnb|bob|canara|idfc|indusind|federal|union|yes|au|rbl|paytm|airtel|jio|state|bank)(?:\s+(?:bank|payments?|ltd|limited|of india))*\s*$/i

/**
 * Two readings of the same screenshot (greyscale, then thresholded) -> one:
 * the first wins field by field, the second fills what the first missed.
 */
export function mergeReadings(a, b) {
  if (!b) return a
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) {
    const empty = out[k] === undefined || out[k] === "" || out[k] === 0 || (Array.isArray(out[k]) && !out[k].length) || (k === "status" && out[k] === "unknown") || (k === "method" && out[k] === "Other")
    if (empty) out[k] = v
  }
  if (Array.isArray(b.otherRefs)) out.otherRefs = [...new Set([...(a.otherRefs || []), ...b.otherRefs])]
  out.isPaymentProof = !!(out.amount && (out.reference || out.otherRefs?.length || out.status === "success"))
  out.confidence = Math.max(a.confidence || 0, b.confidence || 0)
  return out
}

/** How many of the fields that matter a reading found: amount, reference, date, a name. */
export function readingScore(r) {
  return [r?.amount, r?.reference || r?.otherRefs?.length, r?.paidAt, r?.payerName || r?.payeeName].filter(Boolean).length
}

/**
 * OCR text of a payment screenshot -> the raw reading normalizeReading() takes.
 * `ocrConfidence` is Tesseract's 0..100 for the whole image.
 */
export function parseReceiptText(text, ocrConfidence = 100, wordConf = {}, headline = "") {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const all = lines.join("\n")

  const status = /\b(failed|declined|unsuccessful|rejected)\b|will be refunded|refunded if debited/i.test(all)
    ? "failed"
    : /\b(pending|processing|in progress)\b/i.test(all)
      ? "pending"
      : /\b(success(?:ful(?:ly)?)?|completed|paid|sent|received|credited|debited)\b/i.test(all)
        ? "success"
        : "unknown"

  let amount = null
  for (const l of lines) {
    if (AMOUNT_NOISE.test(l)) continue
    const m = l.match(AMOUNT)
    if (m && (amount = parseAmount(m[1]))) break
  }
  if (!amount) amount = parseAmount(labelled(lines, /^amount(?:\s+paid)?\b/i)) || null
  // Last resort: the headline figure on a line of its own ("11,800", "₹11,800" read as "311,800").
  let amountAlt = null
  // The figure in the largest font, from the recogniser's line boxes.
  if (!amount && headline) {
    const hit = headlineAmount(headline, wordConf[headline.replace(/\s+/g, "")] ?? 100, true)
    if (hit) ({ amount, alt: amountAlt } = hit)
  }
  if (!amount) {
    for (const l of lines) {
      const hit = headlineAmount(l, wordConf[l.replace(/\s+/g, "")] ?? 100)
      if (hit) {
        ;({ amount, alt: amountAlt } = hit)
        break
      }
    }
  }

  const labelledRef = fixDigits(labelled(lines, REF_LABEL).replace(/\s+/g, "").match(/^[0-9A-Za-z|]+/)?.[0] || "")
  const scanned = [
    ...(all.match(/\b[A-Z]{4}[RN][0-9A-Z]{11,17}\b/g) || []),
    ...(all.match(/\b[\dOIl]{4} ?[\dOIl]{4} ?[\dOIl]{4}\b/g) || []).map((r) => fixDigits(r.replace(/ /g, ""))),
  ]

  const method = /\bRTGS\b/i.test(all) ? "RTGS" : /\bNEFT\b/i.test(all) ? "NEFT" : /\bIMPS\b/i.test(all) ? "IMPS" : /\bUPI\b|\S@[a-z]+\b/i.test(all) ? "UPI" : "Other"
  const reference = pickReference(labelledRef, scanned)

  return {
    isPaymentProof: !!(amount && (reference || status === "success")),
    status,
    amount: amount || 0,
    amountAlt,
    currency: "INR",
    paidAt: parseReceiptDate(all),
    method,
    app: appFor(all, lines),
    reference: labelledRef,
    otherRefs: scanned,
    payerName: cleanName(labelled(lines, PAYER_LABEL)),
    payeeName: cleanName(labelled(lines, PAYEE_LABEL)),
    note: labelled(lines, NOTE_LABEL).slice(0, 120),
    confidence: Math.round((Math.min(Math.max(ocrConfidence, 0), 100) / 100) * (amount ? 1 : 0.5) * (reference ? 1 : 0.7) * 100) / 100,
  }
}

/**
 * The headline amount's line: the tallest line that is only a number (with at
 * most one stray glyph where the ₹ was), and clearly taller than the text
 * around it (1.5 times the median line), so a pincode in body text never wins.
 * `lines` are [{ text, height }] from the recogniser's line boxes.
 */
export function pickHeadline(lines = []) {
  const heights = lines.map((l) => l.height).filter((h) => h > 0).sort((a, b) => a - b)
  if (!heights.length) return ""
  const median = heights[Math.floor(heights.length / 2)]
  const numeric = lines
    .filter((l) => /^[^\d\s]?\s?[0-9][0-9,.]*$/.test(String(l.text).trim()) && l.height >= 1.5 * median)
    .sort((a, b) => b.height - a.height)
  return numeric[0] ? String(numeric[0].text).trim() : ""
}

/**
 * Dark text on light, everywhere. Apps print white text on coloured bands (a
 * purple header, a red "Payment failed", a blue button) on an otherwise light
 * screen, and the recogniser drops such a band as a picture. `grey` is the
 * image's luminance (0..255, row by row, `width` per row); a dark-mode screen
 * is flipped first, then every row that is still mostly dark (a band) is
 * inverted on its own. Returns a new array.
 */
// ponytail: per full row; a dark card beside light text on the same rows stays as it is, go to per-block if that shows up.
export function evenPolarity(grey, width) {
  const out = new Uint8ClampedArray(grey.length)
  let total = 0
  for (let i = 0; i < grey.length; i++) total += grey[i]
  const flip = total / grey.length < 110
  const hist = new Uint32Array(256)
  for (let y = 0; y < grey.length / width; y++) {
    const start = y * width
    // The row's MEDIAN is its background: text never covers half a row, so a
    // band's rows all agree and no letter is cut in two (a mean would flip the
    // rows through thick white text back and forth).
    hist.fill(0)
    for (let x = 0; x < width; x++) hist[flip ? 255 - grey[start + x] : grey[start + x]]++
    let seen = 0
    let median = 0
    while ((seen += hist[median]) < width / 2) median++
    const band = median < 110
    // Then stretch the row so its background is white: a grey band or card
    // left grey is still dropped as a picture.
    const bg = Math.max(band ? 255 - median : median, 1)
    for (let x = 0; x < width; x++) {
      const g = flip ? 255 - grey[start + x] : grey[start + x]
      out[start + x] = Math.min(255, Math.round(((band ? 255 - g : g) * 255) / bg))
    }
  }
  return out
}
