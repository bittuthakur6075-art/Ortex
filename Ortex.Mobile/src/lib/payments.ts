// Recording and editing a payment from the phone.
//
// Writes the SAME doc as the console's recordPayment()
// (Ortex.Admin/src/data/domain/domain.js) and takes its number from the same
// atomic `next_sequence("payment")`, so a payment logged on the phone and one
// logged at a desk can never share a number. The phone does not link a payment
// to an invoice: that also re-derives the invoice's paid status, which stays a
// console job.
//
// An edit writes only the fields that changed (paymentPatch), as the console's
// RecordPaymentModal does, and keeps the number. The database refuses a change
// to a payment already in Tally from anyone but the Super Admin (0066).
//
// A payment belongs to one company (Admin migration 0075) and takes its number
// from that company's own series. An edit never moves it.

import { repo } from "@/data/repo"
import { documentNumber } from "@/domain/id"
import type { Payment } from "@/domain/schema"
import type { Settings } from "@/domain/settings"
import {
  amountOf,
  paymentBlocker,
  paymentDateIso,
  paymentPatch,
  type PaymentDraft,
} from "@/features/payments/payments"

/** Save to the live ledger. Midday IST keeps the day the same in every time zone. */
export async function recordPayment(d: PaymentDraft, settings: Settings, companyId?: string): Promise<Payment> {
  // Refused here too, before a number is taken: the database refuses it anyway.
  const blocker = paymentBlocker(d)
  if (blocker) throw new Error(blocker)
  const seq = await repo.nextSequence("payment", companyId)
  // The company's own prefix; "PAY" only when it left the field blank. The
  // caller must pass the settings actually read, never DEFAULT_SETTINGS.
  const prefix = String(settings.numbering?.paymentPrefix ?? "").trim() || "PAY"
  return repo.create<Payment>("payments", {
    companyId,
    number: documentNumber(prefix, seq),
    type: d.type,
    amount: amountOf(d.amount),
    method: d.method,
    date: paymentDateIso(d.date),
    reference: d.reference.trim(),
    note: d.note.trim(),
    invoiceId: null,
    invoiceNumber: "",
    party: d.party.trim(),
    customer: null,
  })
}

/** Save the changed fields of a stored payment. Returns it unchanged when nothing changed. */
export async function updatePayment(p: Payment, d: PaymentDraft): Promise<Payment> {
  const blocker = paymentBlocker(d)
  if (blocker) throw new Error(blocker)
  const patch = paymentPatch(p, d)
  if (!Object.keys(patch).length) return p
  const saved = await repo.update<Payment>("payments", p.id, patch)
  if (!saved) throw new Error("This payment is no longer in the ledger")
  return saved
}
