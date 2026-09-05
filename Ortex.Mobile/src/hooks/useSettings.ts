import React from "react"

import { repo } from "@/data/repo"
import { DEFAULT_SETTINGS, type Settings } from "@/domain/settings"

/**
 * The console's singleton settings row: company GSTIN and state code (which
 * decide CGST/SGST vs IGST), the quotation prefix, default validity and terms.
 * Read-only here — the console owns it.
 *
 * Falls back to DEFAULT_SETTINGS rather than null so a caller never has to guard
 * mid-quotation; the defaults are the same object the console merges over.
 */
export function useSettings(): { settings: Settings; loading: boolean } {
  const [settings, setSettings] = React.useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let alive = true
    repo
      .getSettings()
      .then((s) => {
        if (alive) setSettings(s)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return { settings, loading }
}
