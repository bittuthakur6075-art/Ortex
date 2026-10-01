import type { Customer, Row } from "@/domain/schema"
import { nationalDigits } from "@/features/contacts/validateContact"

/**
 * The Customers list, the pure half: search, A-Z sections, the filter chips and
 * what each person has going on (tested in test/directory.test.mjs).
 *
 * Business is matched to a person the way `sameCustomer` does it, email first,
 * then national phone digits, never by name. Here it is an index built once per
 * render instead of a scan per row: four hundred customers against a thousand
 * quotations is a few milliseconds, not four hundred thousand comparisons.
 */

export type CustomerRow = Customer & Row
export type SortMode = "name" | "company"
export type Filter = "all" | "favourites" | "open" | "recent" | "nophone"
export type ContactSection = { letter: string; data: CustomerRow[] }

/** What a person has going on: open quotations, and when anything last happened. */
export type Activity = { open: number; lastAt: number }

type Dated = { customer?: Partial<Customer>; status?: string; createdAt?: string; issueDate?: string }

export const FAVOURITES = "★"
/** "Recent" means a quotation or enquiry in the last 30 days. */
export const RECENT_DAYS = 30
const OPEN = new Set(["draft", "sent"])

export const displayName = (c: Partial<Customer>) => c.name?.trim() || c.company?.trim() || "Unnamed customer"

/** What a row sorts and letters under, given the current Sort by choice. */
export const sortKey = (c: Partial<Customer>, mode: SortMode) =>
  (mode === "company" ? c.company || c.name || "" : c.name || c.company || "").trim()

/** Letters only; digits and symbols land in "#", exactly as One UI does it. */
export function letterFor(value: string): string {
  const first = value.trim().charAt(0).toUpperCase()
  return first >= "A" && first <= "Z" ? first : "#"
}

export const hasPhone = (c: Partial<Customer>) => nationalDigits(c.phone).length > 0

/** Name, company, email, city and GSTIN by text; the phone by 3+ digits, ignoring +91 and spaces. */
export function matches(c: Partial<Customer>, needle: string): boolean {
  const n = needle.trim().toLowerCase()
  if (!n) return true
  const haystack = [c.name, c.company, c.email, c.city, c.gstin].filter(Boolean).join(" ").toLowerCase()
  if (haystack.includes(n)) return true
  // A typed "+91" or trunk "0" is not part of the stored national number.
  const digits = n.replace(/\D/g, "").slice(/^\+91/.test(n) ? 2 : /^0/.test(n) ? 1 : 0)
  return digits.length >= 3 && nationalDigits(c.phone).includes(digits)
}

/** Which field a "nobody matched, add them" should carry the search into. */
export function prefillFromQuery(query: string): Partial<Customer> {
  const q = query.trim()
  if (!q) return {}
  if (q.includes("@")) return { email: q }
  if (/^[\d\s+()-]+$/.test(q) && q.replace(/\D/g, "").length >= 6) return { phone: q }
  return { name: q }
}

const time = (d: Dated) => {
  const v = Date.parse(d.issueDate || d.createdAt || "")
  return Number.isNaN(v) ? 0 : v
}

/** Open quotations and the latest quotation or enquiry, per customer id. */
export function activityIndex(customers: CustomerRow[], quotations: Dated[], enquiries: Dated[]): Map<string, Activity> {
  const byEmail = new Map<string, string>()
  const byPhone = new Map<string, string>()
  for (const c of customers) {
    const mail = (c.email || "").trim().toLowerCase()
    const phone = nationalDigits(c.phone)
    if (mail && !byEmail.has(mail)) byEmail.set(mail, c.id)
    if (phone && !byPhone.has(phone)) byPhone.set(phone, c.id)
  }
  const owner = (snap?: Partial<Customer>) =>
    byEmail.get((snap?.email || "").trim().toLowerCase()) ?? byPhone.get(nationalDigits(snap?.phone))

  const out = new Map<string, Activity>()
  const touch = (d: Dated, open: boolean) => {
    const id = owner(d.customer)
    if (!id) return
    const a = out.get(id) || { open: 0, lastAt: 0 }
    if (open) a.open += 1
    a.lastAt = Math.max(a.lastAt, time(d))
    out.set(id, a)
  }
  for (const q of quotations) touch(q, OPEN.has(q.status || ""))
  for (const e of enquiries) touch(e, false)
  return out
}

export function passes(c: CustomerRow, filter: Filter, favourites: Set<string>, activity: Map<string, Activity>, now = Date.now()) {
  switch (filter) {
    case "favourites":
      return favourites.has(c.id)
    case "open":
      return (activity.get(c.id)?.open || 0) > 0
    case "recent":
      return (activity.get(c.id)?.lastAt || 0) >= now - RECENT_DAYS * 86400000
    case "nophone":
      return !hasPhone(c)
    default:
      return true
  }
}

/**
 * The list as sections. "All" is Samsung's directory: ★ Favourites pinned above
 * A (a COPY of the row; it stays under its own letter too), then A-Z, "#" last.
 * "Recent" is one section, newest first, because the point of it is WHEN. Every
 * other filter, and any search, is plain A-Z.
 */
export function buildSections(
  items: CustomerRow[],
  opts: { needle: string; sort: SortMode; filter: Filter; favourites: Set<string>; activity: Map<string, Activity>; now?: number },
): { sections: ContactSection[]; total: number } {
  const { needle, sort, filter, favourites, activity, now } = opts
  const pool = items.filter((c) => passes(c, filter, favourites, activity, now) && matches(c, needle))
  const collate = (a: CustomerRow, b: CustomerRow) =>
    sortKey(a, sort).localeCompare(sortKey(b, sort), undefined, { sensitivity: "base" })

  if (filter === "recent") {
    const data = [...pool].sort((a, b) => (activity.get(b.id)?.lastAt || 0) - (activity.get(a.id)?.lastAt || 0))
    return { sections: data.length ? [{ letter: `Last ${RECENT_DAYS} days`, data }] : [], total: pool.length }
  }

  const byLetter = new Map<string, CustomerRow[]>()
  for (const c of pool) {
    const letter = letterFor(sortKey(c, sort))
    if (!byLetter.has(letter)) byLetter.set(letter, [])
    byLetter.get(letter)!.push(c)
  }
  const lettered = [...byLetter.entries()]
    .map(([letter, data]) => ({ letter, data: data.sort(collate) }))
    .sort((a, b) => (a.letter === "#" ? 1 : b.letter === "#" ? -1 : a.letter.localeCompare(b.letter)))

  const starred = filter === "all" && !needle.trim() ? pool.filter((c) => favourites.has(c.id)).sort(collate) : []
  return {
    sections: starred.length ? [{ letter: FAVOURITES, data: starred }, ...lettered] : lettered,
    total: pool.length,
  }
}
