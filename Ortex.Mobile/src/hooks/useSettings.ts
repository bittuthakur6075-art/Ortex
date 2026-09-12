import React from "react"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { DEFAULT_SETTINGS, type Settings } from "@/domain/settings"

/**
 * The console's singleton settings row: company GSTIN and state code (which
 * decide CGST/SGST vs IGST), the quotation prefix, default validity and terms.
 * Read-only here — the console owns it.
 *
 * Falls back to DEFAULT_SETTINGS rather than null so a caller never has to guard
 * mid-quotation — but says so. `error` is set when neither the server nor the
 * cache could supply the real company, and the quotation editor shows it, since
 * a document priced on the defaults carries the wrong GSTIN and possibly the
 * wrong tax split. That failure used to be swallowed.
 */
export function useSettings(): { settings: Settings; loading: boolean; error: string | null } {
  const [settings, setSettings] = React.useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    repo
      .getSettings()
      .then((s) => {
        if (!alive) return
        setSettings(s)
        setError(null)
      })
      .catch((e: unknown) => {
        if (alive) setError(errorMessage(e, "Could not load the company settings"))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return { settings, loading, error }
}
