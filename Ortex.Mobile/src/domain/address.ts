import { stateName } from "@/domain/gstStates"

// A company's address as documents print it (companies.doc.company):
// registeredAddress { line1, line2, city, stateCode, pincode } and an optional
// dispatchAddress (same plus `label`). The old single `address` string stays
// for companies whose address has not been split yet.
//
// PORT OF Ortex.Admin/src/lib/address.js, line for line (parity test
// test/address.test.mjs). Edit both.

export type Address = {
  line1?: string
  line2?: string
  city?: string
  stateCode?: string
  pincode?: string
  /** Dispatch address only: what the block is called on a document. */
  label?: string
}

type CompanyAddress = {
  address?: string
  stateCode?: string
  gstin?: string
  registeredAddress?: Address | null
  dispatchAddress?: Address | null
}

export const DISPATCH_LABEL = "Branch / dispatch"

const str = (v: unknown): string => String(v ?? "").trim()

/** An Indian PIN code: six digits, never starting with 0. */
export function isValidPincode(pin: unknown): boolean {
  return /^[1-9]\d{5}$/.test(str(pin))
}

/** ["line1", "line2", "City - 110001", "Delhi"], empty parts left out. */
export function formatAddress(addr: Address | null | undefined): string[] {
  if (!addr) return []
  const city = [str(addr.city), str(addr.pincode)].filter(Boolean).join(" - ")
  return [str(addr.line1), str(addr.line2), city, stateName(addr.stateCode)].filter(Boolean)
}

/** "line1, line2, City - 110001, Delhi" */
export function formatAddressOneLine(addr: Address | null | undefined): string {
  return formatAddress(addr).join(", ")
}

/** The old free-text address in line 1, for the owner to split by hand. */
export function addressFromLegacy(text: unknown): Required<Omit<Address, "label">> {
  const line1 = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(", ")
  return { line1, line2: "", city: "", stateCode: "", pincode: "" }
}

/** True when any part of the address is filled in. */
export function hasAddress(addr: Address | null | undefined): boolean {
  return formatAddress(addr).length > 0
}

// The state a company's address falls back to: its own state, else its GSTIN's.
function companyState(c: CompanyAddress | null | undefined): string {
  return str(c?.stateCode) || (/^\d{2}/.test(str(c?.gstin)) ? str(c?.gstin).slice(0, 2) : "")
}

/**
 * The registered address a document prints: the structured one (its state
 * defaulting to the company's), else the old string's lines.
 */
export function registeredLines(c: CompanyAddress | null | undefined): string[] {
  const r = c?.registeredAddress
  if (r && hasAddress(r)) return formatAddress({ ...r, stateCode: str(r.stateCode) || companyState(c) })
  return String(c?.address ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/**
 * The dispatch address a document prints, or null: { label, title, lines }.
 * The title is "Dispatch from", naming the place when it has its own label.
 */
export function dispatchBlock(c: CompanyAddress | null | undefined): { label: string; title: string; lines: string[] } | null {
  const d = c?.dispatchAddress
  if (!d || !hasAddress(d)) return null
  const label = str(d.label) || DISPATCH_LABEL
  const title = label === DISPATCH_LABEL ? "Dispatch from" : `Dispatch from: ${label}`
  return { label, title, lines: formatAddress({ ...d, stateCode: str(d.stateCode) || companyState(c) }) }
}
