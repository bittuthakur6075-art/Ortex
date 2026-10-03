import { describe, it, expect } from "vitest"
import { SETTLE_TOLERANCE, invoiceBalance, outstandingBalance, paidForInvoice, paymentsOrStored, receiptAllocation, resolveInvoiceStatus } from "./invoiceMoney"
import { editableInvoicePatch, paymentDateIso } from "../data/domain/domain"
import { amountInWords } from "./format"

const inv = (over = {}) => ({ id: "i1", status: "sent", totals: { grandTotal: 1000 }, dueDate: "2999-01-01", ...over })
const pay = (amount, over = {}) => ({ id: `p${amount}`, type: "inflow", invoiceId: "i1", amount, ...over })

describe("resolveInvoiceStatus", () => {
  it("settles within the tolerance", () => {
    expect(SETTLE_TOLERANCE).toBe(0.5)
    expect(resolveInvoiceStatus(inv(), [pay(999.5)])).toBe("paid")
    expect(resolveInvoiceStatus(inv(), [pay(999.4)])).toBe("partial")
    expect(outstandingBalance(inv(), [pay(999.5)])).toBe(0)
    expect(outstandingBalance(inv(), [pay(999.4)])).toBe(0.6)
  })

  it("a stored paid with nothing paid is not paid", () => {
    expect(resolveInvoiceStatus(inv({ status: "paid" }), [])).toBe("sent")
    expect(resolveInvoiceStatus(inv({ status: "partial" }), [])).toBe("sent")
    expect(resolveInvoiceStatus(inv({ status: "paid", dueDate: "2000-01-01" }), [])).toBe("overdue")
  })

  it("keeps draft and cancelled, ignores payouts and other invoices", () => {
    expect(resolveInvoiceStatus(inv({ status: "draft" }), [pay(1000)])).toBe("draft")
    expect(resolveInvoiceStatus(inv({ status: "cancelled" }), [pay(1000)])).toBe("cancelled")
    expect(paidForInvoice("i1", [pay(100), pay(50, { type: "payout" }), pay(70, { invoiceId: "i2" }), pay("30")])).toBe(130)
    expect(outstandingBalance(inv({ status: "draft" }), [])).toBe(0)
  })

  it("without the payments module, the stored amountPaid stands in", () => {
    const invoices = [inv({ amountPaid: 1000 })]
    const stand = paymentsOrStored(invoices, [], false)
    expect(resolveInvoiceStatus(invoices[0], stand)).toBe("paid")
    expect(stand[0].date).toBe(null)
    expect(invoiceBalance(invoices[0], paymentsOrStored(invoices, [pay(10)], true))).toBe(990)
  })
})

describe("updateInvoice patch", () => {
  it("never writes payment-derived, view or connector fields", () => {
    const patch = editableInvoicePatch({ notes: "x", status: "paid", amountPaid: 5, paidAt: "t", _status: "paid", _paid: 1, tally: {}, lines: [] })
    expect(patch).toEqual({ notes: "x", lines: [] })
  })

  it("a picked day is stored as noon IST", () => {
    expect(paymentDateIso("2026-10-03")).toBe("2026-10-03T06:30:00.000Z")
    expect(paymentDateIso("2026-10-03T10:00:00.000Z")).toBe("2026-10-03T10:00:00.000Z")
  })
})

describe("amountInWords", () => {
  it("adds paise and recurses past 99 crore", () => {
    expect(amountInWords(0)).toBe("Rupees Zero Only")
    expect(amountInWords(1200)).toBe("Rupees One Thousand Two Hundred Only")
    expect(amountInWords(1200.5)).toBe("Rupees One Thousand Two Hundred and Fifty Paise Only")
    expect(amountInWords(0.07)).toBe("Rupees Zero and Seven Paise Only")
    expect(amountInWords(1234567890)).toBe("Rupees One Hundred Twenty Three Crore Forty Five Lakh Sixty Seven Thousand Eight Hundred Ninety Only")
    expect(amountInWords(1e12)).not.toMatch(/undefined/)
  })
})

describe("receiptAllocation", () => {
  it("counts only payments on or before this one", () => {
    const a = pay(300, { id: "a", date: "2026-09-01T06:30:00Z", createdAt: "1" })
    const b = pay(200, { id: "b", date: "2026-09-01T06:30:00Z", createdAt: "2" })
    const c = pay(500, { id: "c", date: "2026-09-05T06:30:00Z", createdAt: "3" })
    const all = [c, b, a]
    expect(receiptAllocation(a, inv(), all)).toEqual({ cumulative: 300, balance: 700, partial: true })
    expect(receiptAllocation(b, inv(), all)).toEqual({ cumulative: 500, balance: 500, partial: true })
    expect(receiptAllocation(c, inv(), all)).toEqual({ cumulative: 1000, balance: 0, partial: false })
  })
})
