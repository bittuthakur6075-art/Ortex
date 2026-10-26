// Shared bits for the Users page and its row actions.
import { isSuperAdmin } from "../../lib/roles"
import { moduleControl, reachableModules } from "../../data/domain/modules"

// A readable throwaway password for a new account or a reset. Drawn from
// crypto.getRandomValues, not Math.random: this string is a real credential,
// it is emailed, and Math.random is a seeded PRNG that makes no promise of
// unpredictability. The alphabet leaves out the characters people misread when
// a password is dictated over the phone (0/O, 1/l/I).
const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

export const randomPassword = (length = 12) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = "Ox-"
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

// ---- what only the Super Admin hands out ------------------------------------
// The database refuses the same (protect_profile_privileges and the two user
// functions): an Admin who could tick payroll, leave balances or a module the
// Super Admin keeps from Admins for someone else, or reset that person's
// password, could sign in as them and reach it.

const SUPER_ADMIN_ONLY_KEYS = ["payroll", "leave-balances"]

/** True when `viewer` may not grant or remove this module for anyone. */
export function moduleLockedFor(viewer, key) {
  if (isSuperAdmin(viewer)) return false
  return SUPER_ADMIN_ONLY_KEYS.includes(key) || moduleControl(viewer, key).adminAccess === false
}


/**
 * True when only the Super Admin may reset, deactivate or delete this person:
 * they can open a Super Admin-only module (by role or their own tick), or they
 * work in none of the viewer's companies (Admin migration 0086,
 * admin_manage_refusal()). Before companies exist (0075) nobody is excluded
 * by company.
 */
export function superAdminOnlyTarget(viewer, person, roleGrants) {
  if (!person || isSuperAdmin(viewer)) return false
  if (reachableModules(person, roleGrants, viewer?.moduleControls).some((k) => moduleLockedFor(viewer, k))) return true
  const mine = viewer?.companies || []
  const theirs = person.companies || []
  return mine.length > 0 && theirs.length > 0 && !theirs.some((id) => mine.includes(id))
}

/** True when an Admin may not give this role: its grants carry a Super Admin-only module. */
export function roleLockedFor(viewer, role, roleGrants) {
  if (isSuperAdmin(viewer)) return false
  return (roleGrants?.[role] || []).some((k) => moduleLockedFor(viewer, k))
}
