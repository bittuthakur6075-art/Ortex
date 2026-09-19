import { useCallback, useEffect, useState } from "react"
import { repo } from "../../../data/store/repository"
import { getSettings, listHolidays, todayIST } from "../../../services/attendance"
import { listLeaveTypes } from "../../../services/leave"
import { dayLabel, TONE_CLASS } from "../format"

// Shared pieces of the Leave tab: the context every sub-view needs (types,
// rules, holidays, names), how a request's dates read, and the colour each
// leave type wears on the calendar.

/** Leave types, the day rules (weekly off, sandwich), this year's and next year's holidays, and names. */
export function useLeaveContext() {
  const [ctx, setCtx] = useState({ loading: true })
  const load = useCallback(async () => {
    const year = Number(todayIST().slice(0, 4))
    const [types, settings, holidays, directory] = await Promise.all([
      listLeaveTypes(),
      getSettings(),
      listHolidays({ from: `${year - 1}-01-01`, to: `${year + 1}-12-31` }),
      repo.staffDirectory ? repo.staffDirectory().catch(() => ({})) : {},
    ])
    const doc = settings.doc || {}
    setCtx({
      loading: false,
      missing: Boolean(types.missing),
      error: types.error || null,
      types: types.rows || [],
      weeklyOff: Array.isArray(doc.weeklyOff) ? doc.weeklyOff : [0],
      sandwich: Boolean(doc.sandwich),
      holidays: (holidays.rows || []).filter((h) => h.active !== false),
      directory: directory || {},
    })
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  return { ...ctx, reload: load }
}

/** Day-count rules for leaveDaysBetween, from the context. Optional holidays never count. */
export const dayRules = (ctx) => ({
  weeklyOff: ctx.weeklyOff || [0],
  holidays: (ctx.holidays || []).filter((h) => h.kind !== "optional").map((h) => h.day),
  sandwich: Boolean(ctx.sandwich),
})

/** "22 Sep 2026", "22 Sep to 24 Sep 2026 (from lunch, until lunch)". */
export function datesText(r) {
  const halves = []
  if (r.from_half === "second") halves.push(r.from_day === r.to_day ? "afternoon" : "from lunch")
  if (r.to_half === "first") halves.push(r.from_day === r.to_day ? "morning" : "until lunch")
  const range = r.from_day === r.to_day ? dayLabel(r.from_day, true) : `${dayLabel(r.from_day, true)} to ${dayLabel(r.to_day, true)}`
  return halves.length ? `${range} (${halves.join(", ")})` : range
}

/** The tint a leave type wears on the calendar and in its chip. */
const TYPE_TONE = { EL: "primary", CL: "emerald", SL: "amber", CO: "violet", LOP: "rose" }
export const typeTone = (code) => TONE_CLASS[TYPE_TONE[code] || "slate"]

/** Name for a user id from the staff directory. */
export const nameOf = (ctx, id) => ctx.directory?.[id]?.name || "Unknown"

/** Whole days: 1.0 → "1", 2.5 → "2.5". */
export const num = (n) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(1))
