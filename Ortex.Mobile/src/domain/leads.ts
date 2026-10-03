import type { Enquiry } from "@/domain/schema"

/**
 * The writes a lead takes on the phone, as the SAME doc shape the console
 * writes (Ortex.Admin/src/pages/leads/actions.jsx `writeStatus` and
 * `logActivity`, EnquiryDetail.jsx's composer, lib/salesWork.js presets).
 * Pure: every function takes `now`, so the tests are not a race with the clock.
 */

const HOUR = 3600000
const DAY = 24 * HOUR

export type LeadActivity = { id: string; type: string; text: string; at: string; by: string }

/** The console's fields on an enquiry doc that schema.ts does not name. */
export type LeadDoc = Enquiry & {
  statusAt?: Record<string, string>
  followUpAt?: string | null
  activity?: LeadActivity[]
  lostReason?: string
  nextStep?: string
}

const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Tomorrow at 10 am. MIRROR of `tomorrowAt10` in Admin lib/salesWork.js. */
export function tomorrowAt10(now = Date.now()): string {
  const d = new Date(startOfDay(now) + DAY)
  d.setHours(10, 0, 0, 0)
  return d.toISOString()
}

/** The follow-up presets. MIRROR of `snoozePresets` in Admin lib/salesWork.js. */
export function snoozePresets(now = Date.now()): { key: string; label: string; at: string }[] {
  const later = new Date(now + 3 * HOUR)
  later.setMinutes(0, 0, 0)
  const tomorrow = new Date(tomorrowAt10(now)).getTime()
  return [
    ...(startOfDay(later.getTime()) === startOfDay(now) ? [{ key: "later", label: "Later today", at: later.toISOString() }] : []),
    { key: "tomorrow", label: "Tomorrow, 10 am", at: tomorrowAt10(now) },
    { key: "3days", label: "In 3 days", at: new Date(tomorrow + 2 * DAY).toISOString() },
    { key: "week", label: "Next week", at: new Date(tomorrow + 6 * DAY).toISOString() },
  ]
}

/** 10 am on the day `days` after today: the "Pick a date" stepper (never in the past: days >= 1). */
export function dayAt10(days: number, now = Date.now()): string {
  const d = new Date(startOfDay(now) + Math.max(1, Math.round(days)) * DAY)
  d.setHours(10, 0, 0, 0)
  return d.toISOString()
}

/** A status change: dates the new step, clears a follow-up that belonged to the old one. */
export function statusPatch(e: LeadDoc, status: string, at: string, extra: Record<string, unknown> = {}) {
  return { status, followUpAt: null, statusAt: { ...(e.statusAt || {}), [status]: at }, ...extra }
}

/** What Undo writes back, as the console's: the row's own status, dates, follow-up and lost reason. */
export function undoPatch(e: LeadDoc) {
  return {
    status: e.status || "new",
    statusAt: e.statusAt || {},
    followUpAt: e.followUpAt ?? null,
    lostReason: e.lostReason || "",
  }
}

export type Outcome = {
  /** How they were reached. */
  channel: "call" | "whatsapp"
  /** A new status, or "" to leave it (a call still moves new to contacted). */
  status?: string
  lostReason?: string
  /** ISO time of the next follow-up, or null for none. */
  followUpAt?: string | null
  note?: string
}

/**
 * "How did it go?": the activity entries and status the console's composer
 * would write for the same answers. A call answers the follow-up that was due
 * and moves a new lead to contacted; a chosen follow-up is logged as its own
 * entry and becomes `followUpAt`; Lost needs a reason.
 */
export function outcomePatch(e: LeadDoc, o: Outcome, by: string, now: number, newId: () => string) {
  const at = new Date(now).toISOString()
  const note = (o.note || "").trim()
  const entries: LeadActivity[] = [
    {
      id: newId(),
      type: o.channel,
      text: note || (o.channel === "call" ? "Called" : "Messaged on WhatsApp"),
      at,
      by,
    },
  ]
  const was = e.status || "new"
  let patch: Record<string, unknown> = {}
  const status = o.status || (o.channel === "call" && was === "new" ? "contacted" : "")
  if (status === "lost" && !o.lostReason) throw new Error("Pick why it was lost")
  if (status && status !== was) patch = statusPatch(e, status, at, status === "lost" ? { lostReason: o.lostReason } : {})
  else if (o.channel === "call") patch.followUpAt = null
  if (o.followUpAt) {
    if (new Date(o.followUpAt).getTime() <= now) throw new Error("That time has passed. Pick one in the future.")
    entries.push({ id: newId(), type: "followup", text: `Follow up on ${dayMonth(o.followUpAt)}`, at, by })
    patch.followUpAt = o.followUpAt
  }
  return { ...patch, activity: [...(e.activity || []), ...entries] }
}

/** "3 Oct". */
export function dayMonth(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}`
}
