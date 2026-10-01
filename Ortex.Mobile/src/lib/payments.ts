// Recording a payment from the phone.
//
// Writes the SAME doc as the console's recordPayment()
// (Ortex.Admin/src/data/domain/domain.js) and takes its number from the same
// atomic `next_sequence("payment")`, so a payment logged on the phone and one
// logged at a desk can never share a number. The phone does not link a payment
// to an invoice: that also re-derives the invoice's paid status, which stays a
// console job.

import { repo } from "@/data/repo"
import { documentNumber } from "@/domain/id"
import type { Payment } from "@/domain/schema"
import type { Settings } from "@/domain/settings"
import { amountOf, type PaymentDraft } from "@/features/payments/payments"

/** Save to the live ledger. Midday IST keeps the day the same in every time zone. */
export async function recordPayment(d: PaymentDraft, settings: Settings): Promise<Payment> {
  const seq = await repo.nextSequence("payment")
  const prefix = settings.numbering.paymentPrefix || "PAY"
  return repo.create<Payment>("payments", {
    number: documentNumber(prefix, seq),
    type: d.type,
    amount: amountOf(d.amount),
    method: d.method,
    date: new Date(`${d.date}T12:00:00+05:30`).toISOString(),
    reference: d.reference.trim(),
    note: d.note.trim(),
    invoiceId: null,
    invoiceNumber: "",
    party: d.party.trim(),
    customer: null,
  })
}
