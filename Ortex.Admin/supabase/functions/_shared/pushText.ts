// Pure pieces of push-notify, kept free of imports so vitest can load them
// (src/lib/pushText.test.js). The phone reads `data` (Ortex.Mobile
// src/domain/pushTarget.ts pushRoute): targetScreen + targetId must be a route
// it knows, and `kind` "claim" is the one server push it shows in the
// foreground (it has no realtime copy of its own).

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/** Has this phone switched the category off? (push_devices.muted, migration 0074) */
export function mutes(muted: unknown, category: string): boolean {
  return Array.isArray(muted) && (muted.includes("all") || muted.includes(category))
}

/** "September 2026" from a pay run's month ("2026-09-01"), or "" when unreadable. */
export function monthWords(month: unknown): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(month || ""))
  return m && MONTHS[Number(m[2]) - 1] ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ""
}

type Out = { title: string; body: string; tag: string; data: Record<string, string> }

/**
 * A payslip is released. Never an amount: it shows on a locked phone. Same
 * words and tag as the phone's own copy (features/pay/PayslipAlerts.tsx).
 */
export function payslipPush(slip: { id: string }, month: unknown): Out {
  const when = monthWords(month)
  const title = when ? `Your payslip for ${when} is ready` : "Your payslip is ready"
  const tag = `payslip-${slip.id}`
  return {
    title,
    body: "Tap to see the breakup or download the PDF.",
    tag,
    data: { id: tag, targetScreen: "Payslip", targetId: String(slip.id), phone: "", title, remote: "1", kind: "payslip" },
  }
}

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** A reimbursement claim was approved or rejected, to the person who made it. No amount. */
export function claimPush(c: { id: string; status: string; category?: string | null; bill_date?: string | null; decision_note?: string | null }): Out | null {
  if (c.status !== "approved" && c.status !== "rejected") return null
  const title = c.status === "approved" ? "Your claim was approved" : "Your claim was not approved"
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(c.bill_date || ""))
  const bill = d ? `bill dated ${Number(d[3])} ${SHORT[Number(d[2]) - 1]}` : ""
  const what = [String(c.category || "").trim(), bill].filter(Boolean).join(" · ")
  const note = String(c.decision_note || "").trim()
  const tag = `claim-${c.status}-${c.id}`
  return {
    title,
    body: [what || "Reimbursement claim", note].filter(Boolean).join(". "),
    tag,
    data: { id: tag, targetScreen: "PayClaims", targetId: String(c.id), phone: "", title, remote: "1", kind: "claim" },
  }
}
