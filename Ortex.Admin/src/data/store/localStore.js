import { uid } from "../../lib/id"
import { COMPANY_BLOCKS, DEFAULT_SETTINGS, mergeSettings, settingsFor } from "../domain/settingsDefaults"
import { companyIdForCreate, isCompanyTable } from "./company"

// LocalStore, the browser-backed implementation of the repository contract.
//
// Every collection is a JSON array under `ortex_admin_<name>`; settings is a
// singleton object. All methods are async (return Promises) even though
// localStorage is synchronous, so a future ApiStore with the same surface can
// be swapped in without touching any component. A single change event fans out
// to all subscribers (this tab); the native `storage` event covers other tabs.

const PREFIX = "ortex_admin_"
const SETTINGS_KEY = "ortex_admin_settings"
const CHANGE_EVENT = "ortex-admin-store-change"

function readCollection(name) {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFIX + name) || "[]")
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function writeCollection(name, rows) {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(rows))
  } catch (err) {
    // Browser localStorage is ~5MB; base64 product images are the usual culprit.
    if (err && (err.name === "QuotaExceededError" || err.code === 22 || err.code === 1014)) {
      throw new Error("Storage is full - the images may be too large. Remove some images or use smaller files.")
    }
    throw err
  }
  emit()
}

function emit() {
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

const nowIso = () => new Date().toISOString()

const COMPANIES_KEY = "ortex_admin_companies"

// Demo mode mirrors migration 0075: Ortex (seeded from the demo settings) and
// two companies switched off. A demo row from before companies is Ortex's.
function readCompanies() {
  try {
    const raw = JSON.parse(localStorage.getItem(COMPANIES_KEY) || "null")
    if (Array.isArray(raw) && raw.length) return raw
  } catch {
    // a broken copy is replaced by the seed below
  }
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null")
  } catch {
    saved = null
  }
  const g = mergeSettings(saved)
  const doc = Object.fromEntries(COMPANY_BLOCKS.map((k) => [k, g[k]]))
  return [
    { id: "ortex", name: g.company.name || "Ortex Industries", doc: { ...doc, tallyCompany: "Ortex Industries" }, active: true, sort: 0 },
    { id: "aman", name: "Aman Enterprise", doc: { company: { name: "Aman Enterprise" } }, active: false, sort: 1 },
    { id: "nidhi", name: "Nidhi Industries", doc: { company: { name: "Nidhi Industries" } }, active: false, sort: 2 },
  ]
}

const withCompany = (name, r) => (isCompanyTable(name) && !r.companyId ? { ...r, companyId: "ortex" } : r)
const stamp = (name, data) => {
  const companyId = companyIdForCreate(name, data)
  return companyId ? { companyId } : {}
}

export const localStore = {
  kind: "local",

  subscribe(callback) {
    const onStorage = (e) => {
      if (!e.key || e.key.startsWith(PREFIX)) callback()
    }
    window.addEventListener(CHANGE_EVENT, callback)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(CHANGE_EVENT, callback)
      window.removeEventListener("storage", onStorage)
    }
  },

  async list(name, { limit = Infinity } = {}) {
    const rows = readCollection(name).map((r) => withCompany(name, r))
    return limit === Infinity ? rows : rows.slice(0, limit)
  },

  async count(name) {
    return readCollection(name).length
  },

  async get(name, id) {
    const row = readCollection(name).find((r) => r.id === id)
    return row ? withCompany(name, row) : null
  },

  async create(name, data) {
    const rows = readCollection(name)
    const record = { ...data, ...stamp(name, data), id: data.id || uid(name.slice(0, 3)), createdAt: nowIso(), updatedAt: nowIso() }
    rows.push(record)
    writeCollection(name, rows)
    return record
  },

  async bulkCreate(name, items) {
    const rows = readCollection(name)
    const created = items.map((data) => ({
      ...data,
      ...stamp(name, data),
      id: data.id || uid(name.slice(0, 3)),
      createdAt: data.createdAt || nowIso(),
      updatedAt: nowIso(),
    }))
    writeCollection(name, [...rows, ...created])
    return created
  },

  async update(name, id, patch) {
    const rows = readCollection(name)
    const idx = rows.findIndex((r) => r.id === id)
    if (idx === -1) return null
    // Never the company: only a create stamps it (as on Supabase).
    rows[idx] = { ...rows[idx], ...patch, id, ...(rows[idx].companyId ? { companyId: rows[idx].companyId } : {}), updatedAt: nowIso() }
    writeCollection(name, rows)
    return rows[idx]
  },

  async remove(name, id) {
    writeCollection(name, readCollection(name).filter((r) => r.id !== id))
    return true
  },

  // Offline mode has no accounts and no server trigger, so there is no actor to
  // record and no history to show. Returning empty keeps the repository
  // contract whole and lets the audit card render its own "not recorded" state
  // rather than making every caller test which store it is talking to.
  async history() {
    return []
  },

  async actorHistory() {
    return []
  },

  async staffDirectory() {
    return {}
  },

  async getSettings(companyId) {
    const global = await this.getGlobalSettings()
    const company = companyId && readCompanies().find((c) => c.id === companyId)
    return company ? settingsFor(global, company.doc) : global
  },

  async getGlobalSettings() {
    try {
      // Deep-merge saved over defaults so new default keys appear for old data.
      return mergeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"))
    } catch {
      return DEFAULT_SETTINGS
    }
  },

  async saveSettings(next) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
    emit()
    return next
  },

  // Atomically read + bump a numbering series, returning the value just used.
  async listCompanies() {
    return [...readCompanies()].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id))
  },

  async saveCompany(company) {
    const all = readCompanies()
    const next = { ...all.find((c) => c.id === company.id), ...company, updated_at: nowIso() }
    localStorage.setItem(COMPANIES_KEY, JSON.stringify([...all.filter((c) => c.id !== company.id), next]))
    emit()
    return next
  },

  // Ortex (and no company) counts in the demo settings, as before; another
  // company in its own doc, as each company has its own series on Supabase.
  async nextSequence(series, companyId) {
    const key = `${series}Seq`
    if (companyId && companyId !== "ortex") {
      const company = readCompanies().find((c) => c.id === companyId)
      if (!company) throw new Error(`Unknown company "${companyId}".`)
      const at = company.doc?.numbering?.[key] || 1
      await this.saveCompany({ ...company, doc: { ...company.doc, numbering: { ...company.doc?.numbering, [key]: at + 1 } } })
      return at
    }
    const settings = await this.getGlobalSettings()
    const current = settings.numbering[key] || 1
    await this.saveSettings({
      ...settings,
      numbering: { ...settings.numbering, [key]: current + 1 },
    })
    return current
  },

  async clearAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX) || k === SETTINGS_KEY || k === COMPANIES_KEY)
      .forEach((k) => localStorage.removeItem(k))
    emit()
  },

  async exportAll() {
    const data = {}
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => {
        data[k] = JSON.parse(localStorage.getItem(k) || "null")
      })
    return data
  },
}
