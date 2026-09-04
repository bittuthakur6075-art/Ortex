// Human-readable labels for user roles and module keys, shared by the Users
// and Profile pages.

import { MODULES } from "../data/domain/modules"

export const ROLE_LABEL = { admin: "Admin", sales: "Sales Executive" }

export const roleLabel = (role) => ROLE_LABEL[role] || role

export const moduleLabel = (key) => MODULES.find((m) => m.key === key)?.label || key
