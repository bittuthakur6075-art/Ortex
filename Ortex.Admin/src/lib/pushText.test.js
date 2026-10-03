// push-notify's pure parts (supabase/functions/_shared/pushText.ts and fcm.ts).
// The phone routes on data.targetScreen / targetId (Ortex.Mobile
// src/domain/pushTarget.ts, tested there with the same shapes).
import { describe, expect, it } from "vitest"

import { fcmMessage, tokenIsGone } from "../../supabase/functions/_shared/fcm.ts"
import { claimPush, monthWords, mutes, payslipPush } from "../../supabase/functions/_shared/pushText.ts"

describe("payslip push", () => {
  it("names the month, never an amount, and opens the payslip", () => {
    const p = payslipPush({ id: "s1" }, "2026-09-01")
    expect(p.title).toBe("Your payslip for September 2026 is ready")
    expect(p.body).not.toMatch(/\d/)
    expect(p.tag).toBe("payslip-s1")
    expect(p.data).toMatchObject({ targetScreen: "Payslip", targetId: "s1", remote: "1", kind: "payslip" })
    expect(Object.values(p.data).every((v) => typeof v === "string")).toBe(true)
  })
  it("survives a missing month", () => {
    expect(payslipPush({ id: "s1" }, null).title).toBe("Your payslip is ready")
    expect(monthWords("2026-13-01")).toBe("")
  })
})

describe("claim push", () => {
  const claim = { id: "c1", status: "approved", category: "Travel", bill_date: "2026-09-12", amount: 1500, decision_note: "" }
  it("says the verdict and the bill, not the amount", () => {
    const p = claimPush(claim)
    expect(p.title).toBe("Your claim was approved")
    expect(p.body).toBe("Travel · bill dated 12 Sep")
    expect(p.body).not.toContain("1500")
    expect(p.data).toMatchObject({ targetScreen: "PayClaims", kind: "claim" })
  })
  it("carries the reason when declined", () => {
    const p = claimPush({ ...claim, status: "rejected", decision_note: "No bill attached" })
    expect(p.title).toBe("Your claim was not approved")
    expect(p.body).toBe("Travel · bill dated 12 Sep. No bill attached")
    expect(p.tag).toBe("claim-rejected-c1")
  })
  it("ignores anything but a decision", () => {
    expect(claimPush({ ...claim, status: "paid" })).toBeNull()
    expect(claimPush({ ...claim, status: "cancelled" })).toBeNull()
  })
})

describe("muted categories", () => {
  it("honours a category and the master switch", () => {
    expect(mutes(["chat"], "chat")).toBe(true)
    expect(mutes(["chat"], "pay")).toBe(false)
    expect(mutes(["all"], "enquiries")).toBe(true)
    expect(mutes(undefined, "pay")).toBe(false)
  })
})

describe("FCM message", () => {
  const msg = { title: "t", body: "b", tag: "chat-1", channelId: "chat_v1", data: { kind: "chat" } }
  it("is a notification message on the phone's channel and tag, private by default", () => {
    const m = fcmMessage("tok", msg).message
    expect(m.token).toBe("tok")
    expect(m.notification).toEqual({ title: "t", body: "b" })
    expect(m.android.notification).toMatchObject({ channel_id: "chat_v1", tag: "chat-1", icon: "notification_icon", visibility: "PRIVATE" })
  })
  it("leads are public and loudest", () => {
    const n = fcmMessage("tok", { ...msg, visibility: "PUBLIC", priority: "PRIORITY_MAX" }).message.android.notification
    expect(n).toMatchObject({ visibility: "PUBLIC", notification_priority: "PRIORITY_MAX" })
  })
  it("drops only tokens that can never work again", () => {
    expect(tokenIsGone(404, "")).toBe(true)
    expect(tokenIsGone(400, '{"error":{"status":"INVALID_ARGUMENT","details":[{"errorCode":"UNREGISTERED"}]}}')).toBe(true)
    expect(tokenIsGone(403, "SENDER_ID_MISMATCH")).toBe(true)
    expect(tokenIsGone(400, "The registration token is not a valid FCM registration token")).toBe(true)
    expect(tokenIsGone(400, "Invalid value at 'message.android.notification.color'")).toBe(false)
    expect(tokenIsGone(500, "INTERNAL")).toBe(false)
  })
})
