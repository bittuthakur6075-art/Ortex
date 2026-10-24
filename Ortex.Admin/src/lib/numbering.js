// Document-number prefixes per company (settings numbering block, 0075/0084).
//
// A number is PREFIX-FY-SEQ (lib/id.js documentNumber). GST Rule 46 caps an
// invoice number at 16 characters, so with a 5-digit sequence the prefix may
// be at most 5. Prefixes are also unique across companies (any series), so a
// receipt, a WhatsApp share or a Tally voucher number names its company.

export const PREFIX_KEYS = ["quotationPrefix", "invoicePrefix", "paymentPrefix"]
export const FALLBACK_PREFIX = { quotationPrefix: "QTN", invoicePrefix: "INV", paymentPrefix: "PAY" }
export const MAX_INVOICE_NUMBER = 16
const LABEL = { quotationPrefix: "Quotation", invoicePrefix: "Invoice", paymentPrefix: "Payment" }
const PREFIX_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/

/** The prefix a number will actually use: a blank one falls back, as generateNumber does. */
export function effectivePrefix(numbering, key) {
  return String(numbering?.[key] ?? "").trim().toUpperCase() || FALLBACK_PREFIX[key]
}

/** Longest invoice number a prefix makes: PREFIX-2627-99999. */
export function longestInvoiceNumber(prefix) {
  return `${prefix}-2627-99999`.length
}

/**
 * Problems with one company's prefixes, as on-screen sentences ([] = fine).
 * `others` is [{ name, numbering }] for every OTHER company, each numbering
 * already resolved (settingsFor), so a company relying on the global default
 * counts as using QTN / INV / PAY.
 */
export function prefixProblems(numbering, others = []) {
  const problems = []
  const mine = PREFIX_KEYS.map((k) => [k, effectivePrefix(numbering, k)])
  for (const [k, p] of mine) {
    if (!PREFIX_RE.test(p)) problems.push(`${LABEL[k]} prefix: use only capital letters, numbers and single hyphens.`)
  }
  const inv = effectivePrefix(numbering, "invoicePrefix")
  if (longestInvoiceNumber(inv) > MAX_INVOICE_NUMBER) {
    problems.push(`Invoice prefix: at most ${MAX_INVOICE_NUMBER - longestInvoiceNumber("")} characters, so an invoice number stays within the GST limit of ${MAX_INVOICE_NUMBER}.`)
  }
  const seen = new Map()
  for (const [k, p] of mine) {
    if (seen.has(p)) problems.push(`${LABEL[k]} and ${LABEL[seen.get(p)].toLowerCase()} prefixes are both ${p}. Give each its own.`)
    else seen.set(p, k)
  }
  for (const o of others) {
    const theirs = new Set(PREFIX_KEYS.map((k) => effectivePrefix(o.numbering, k)))
    for (const [k, p] of mine) {
      if (theirs.has(p)) problems.push(`${LABEL[k]} prefix ${p} is already used by ${o.name}. Choose another.`)
    }
  }
  return problems
}
