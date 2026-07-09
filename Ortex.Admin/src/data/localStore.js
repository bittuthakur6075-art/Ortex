import { uid } from "../lib/id"
import { DEFAULT_SETTINGS, mergeSettings } from "./settingsDefaults"

// LocalStore — the browser-backed implementation of the repository contract.
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
      throw new Error("Storage is full — the images may be too large. Remove some images or use smaller files.")
    }
    throw err
  }
  emit()
}

function emit() {
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

const nowIso = () => new Date().toISOString()

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
    const rows = readCollection(name)
    return limit === Infinity ? rows : rows.slice(0, limit)
  },

  async count(name) {
    return readCollection(name).length
  },

  async get(name, id) {
    return readCollection(name).find((r) => r.id === id) || null
  },

  async create(name, data) {
    const rows = readCollection(name)
    const record = { ...data, id: data.id || uid(name.slice(0, 3)), createdAt: nowIso(), updatedAt: nowIso() }
    rows.push(record)
    writeCollection(name, rows)
    return record
  },

  async bulkCreate(name, items) {
    const rows = readCollection(name)
    const created = items.map((data) => ({
      ...data,
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
    rows[idx] = { ...rows[idx], ...patch, id, updatedAt: nowIso() }
    writeCollection(name, rows)
    return rows[idx]
  },

  async remove(name, id) {
    writeCollection(name, readCollection(name).filter((r) => r.id !== id))
    return true
  },

  async getSettings() {
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
  async nextSequence(series) {
    const settings = await this.getSettings()
    const key = `${series}Seq`
    const current = settings.numbering[key] || 1
    await this.saveSettings({
      ...settings,
      numbering: { ...settings.numbering, [key]: current + 1 },
    })
    return current
  },

  async clearAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX) || k === SETTINGS_KEY)
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
