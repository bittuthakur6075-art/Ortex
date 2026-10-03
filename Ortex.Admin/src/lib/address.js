import { stateName } from "./gstStates"

// A company's address as documents print it (companies.doc.company):
// registeredAddress { line1, line2, city, stateCode, pincode } and an optional
// dispatchAddress (same plus `label`). The old single `address` string stays
// for companies whose address has not been split yet.
//
// MIRRORED line for line in Ortex.Mobile/src/domain/address.ts (parity test
// Ortex.Mobile/test/address.test.mjs). Edit both.

export const DISPATCH_LABEL = "Branch / dispatch"

const str = (v) => String(v ?? "").trim()

// An Indian PIN code: six digits, never starting with 0.
export function isValidPincode(pin) {
  return /^[1-9]\d{5}$/.test(str(pin))
}

// ["line1", "line2", "City - 110001", "Delhi"], empty parts left out.
export function formatAddress(addr) {
  if (!addr) return []
  const city = [str(addr.city), str(addr.pincode)].filter(Boolean).join(" - ")
  return [str(addr.line1), str(addr.line2), city, stateName(addr.stateCode)].filter(Boolean)
}

// "line1, line2, City - 110001, Delhi"
export function formatAddressOneLine(addr) {
  return formatAddress(addr).join(", ")
}

// The old free-text address in line 1, for the owner to split by hand.
export function addressFromLegacy(text) {
  const line1 = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(", ")
  return { line1, line2: "", city: "", stateCode: "", pincode: "" }
}

// True when any part of the address is filled in.
export function hasAddress(addr) {
  return formatAddress(addr).length > 0
}

// The state a company's address falls back to: its own state, else its GSTIN's.
function companyState(c) {
  return str(c?.stateCode) || (/^\d{2}/.test(str(c?.gstin)) ? str(c.gstin).slice(0, 2) : "")
}

// The registered address a document prints: the structured one (its state
// defaulting to the company's), else the old string's lines.
export function registeredLines(c) {
  const r = c?.registeredAddress
  if (hasAddress(r)) return formatAddress({ ...r, stateCode: str(r.stateCode) || companyState(c) })
  return String(c?.address ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

// The dispatch address a document prints, or null: { label, title, lines }.
// The title is "Dispatch from", naming the place when it has its own label.
export function dispatchBlock(c) {
  const d = c?.dispatchAddress
  if (!hasAddress(d)) return null
  const label = str(d.label) || DISPATCH_LABEL
  const title = label === DISPATCH_LABEL ? "Dispatch from" : `Dispatch from: ${label}`
  return { label, title, lines: formatAddress({ ...d, stateCode: str(d.stateCode) || companyState(c) }) }
}
