import React from "react"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { DEFAULT_SETTINGS, type Settings } from "@/domain/settings"
import { useCompany } from "@/store/CompanyContext"

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
 *
 * `companyId` picks whose settings (Admin migration 0075): a record's own
 * company. Omitted, the company the person is working in; in All mode, or
 * before 0075, the caller's default company as `settings_staff` gives it.
 */
export function useSettings(companyId?: string | null): { settings: Settings; loading: boolean; error: string | null } {
  const { defaultCompany } = useCompany()
  const company = companyId || defaultCompany || undefined
  const [settings, setSettings] = React.useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    setLoading(true)
    repo
      .getSettings(company)
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
  }, [company])

  return { settings, loading, error }
}
