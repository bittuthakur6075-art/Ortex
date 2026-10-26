// The two role tests every gate needs, with no imports of their own.
// lib/roles.js re-exports them; data/domain/modules.js imports them from here,
// because roles.js imports MODULES and the pair would otherwise import each
// other (a cycle the phone's parity-test loader cannot follow).

const roleOf = (p) => (typeof p === "string" ? p : p?.role)

/** Super Admin or Admin: every module, and every admin-only page. */
export const isAdmin = (p) => roleOf(p) === "admin" || roleOf(p) === "super_admin"
export const isSuperAdmin = (p) => roleOf(p) === "super_admin"
