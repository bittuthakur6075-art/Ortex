// The attendance QR code (migration 0043).
//
// The console SHOWS the code; it never validates one. A token reaches this
// browser only through attendance_qr_show(), which refuses anyone who is not
// the Super Admin or an admin holding the `attendance-qr` grant, and the
// attendance_qr table itself has no select policy at all. So there is nothing
// here that reads the table: every call is the function.
//
// Like services/attendance.js, a read reports `missing: true` when 0043 has
// not been pushed to this project, so the page can say so plainly instead of
// printing a Postgres error code.

import { supabase, hasSupabase } from "../data/store/supabaseClient"
import { isMissing } from "./attendance"

/** The code that should be on screen right now, for one station. */
export async function showCode(siteId) {
  if (!hasSupabase) return { missing: true }
  const { data, error } = await supabase.rpc("attendance_qr_show", { p_site: siteId || null })
  if (error) {
    if (isMissing(error)) return { missing: true }
    return { error: error.message || "The code could not be shown." }
  }
  return { code: data }
}

/** The stations this person may drive, for the picker. */
export async function listStations() {
  if (!hasSupabase) return { rows: [], missing: true }
  const { data, error } = await supabase.rpc("attendance_qr_sites")
  if (error) {
    if (isMissing(error)) return { rows: [], missing: true }
    return { rows: [], error: error.message || "The stations could not be read." }
  }
  return { rows: data || [], missing: false }
}

/**
 * Follow one station's row. The token never travels over realtime (the row is
 * unreadable to this client), so what arrives is only the FACT that the code
 * changed; the caller answers it by calling showCode again. That is what makes
 * a burned code redraw the screen the instant someone scans it.
 */
export function watchStation(siteId, onChange) {
  if (!hasSupabase || !siteId) return () => {}
  const channel = supabase
    .channel(`attendance-qr-${siteId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "attendance_qr", filter: `site_id=eq.${siteId}` },
      () => onChange(),
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
