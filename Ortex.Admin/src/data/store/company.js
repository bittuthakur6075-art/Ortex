// The company the console is looking at (migrations 0075 and 0076).
//
// "all" or one company id, saved per user in this browser. The default is the
// person's first company (the database's default_company_id()); "all" only for
// admins with more than one. A database without companies (before 0075) has an
// empty list: nothing is filtered, nothing is stamped, nothing changes.
//
// Plain module state (no React), because the stores stamp new rows with it.
// hooks/useCompany.js feeds it the profile and the companies table and reads it
// back. It never imports the repository (the stores import this file).

import {
  COMPANY_TABLES,
  canSeeAllCompanies,
  companiesOf,
  companyForCreate,
  companyScope,
  inCompanies,
  pickCompany,
} from "../../lib/roles"

const KEY = "ortex.company."

let state = { all: [], profile: null, saved: null, userKey: "" }
let view = derive(state)
const listeners = new Set()

function derive(s) {
  const companies = companiesOf(s.profile, s.all)
  const current = pickCompany(s.saved, s.profile, companies)
  return {
    all: s.all,
    companies,
    current,
    canAll: canSeeAllCompanies(s.profile, companies),
    multi: companies.length > 1,
    scope: companyScope(current, companies),
    // "" in All mode: a create must then name its company.
    defaultCompany: current === "all" ? "" : current,
    on: companies.length > 0,
  }
}

function emit(next) {
  state = next
  view = derive(state)
  for (const fn of listeners) fn()
}

const readSaved = (userKey) => {
  try {
    return localStorage.getItem(KEY + userKey)
  } catch {
    return null
  }
}

export const companyState = {
  get: () => view,
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  /** The signed-in person (useProfile) and the companies table as they may read it. */
  attach(profile, all) {
    const userKey = profile?.id || profile?.email || "local"
    if (profile === state.profile && all === state.all) return
    const saved = userKey === state.userKey ? state.saved : readSaved(userKey)
    emit({ ...state, profile, all: all ?? state.all, userKey, saved })
  },
  /** A fresh read of the companies table, for the same person. */
  setAll(all) {
    emit({ ...state, all: all || [] })
  },
  set(choice) {
    try {
      localStorage.setItem(KEY + state.userKey, choice)
    } catch {
      // private window: the choice lasts this tab only
    }
    emit({ ...state, saved: choice })
  },
}

/** The company a list item, a record or an id belongs to, by name. */
export const companyName = (id) => (id && state.all.find((c) => c.id === id)?.name) || ""

/** Is this collection one of the six company tables? */
export const isCompanyTable = (name) => COMPANY_TABLES.includes(name)

/**
 * The company_id a new row of `name` is written with: its own companyId (an
 * undo keeps the original), else the current company. Throws "Choose a
 * company" in All mode; undefined when the table has no company or the
 * database has no companies (its default applies).
 */
export function companyIdForCreate(name, data) {
  if (!isCompanyTable(name)) return undefined
  return companyForCreate(data?.companyId ?? view.defaultCompany, view.on)
}

/** The rows of a company table that the current choice shows (other tables unchanged). */
export function scopeRows(name, rows) {
  return isCompanyTable(name) ? inCompanies(rows, view.scope) : rows
}
