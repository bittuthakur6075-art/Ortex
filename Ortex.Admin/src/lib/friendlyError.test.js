import { describe, it, expect } from "vitest"
import { friendlyError } from "./friendlyError"

describe("friendlyError", () => {
  it("replaces technical database wording", () => {
    expect(friendlyError({ code: "42501", message: 'new row violates row-level security policy for table "invoices"' })).toMatch(/permission/)
    expect(friendlyError({ code: "PGRST116", message: "Cannot coerce the result to a single JSON object" })).toMatch(/no longer available/)
    expect(friendlyError({ code: "23505", message: 'duplicate key value violates unique constraint "x"' })).toMatch(/already exists/)
    expect(friendlyError({ code: "23514", message: 'new row for relation "payments" violates check constraint "amount_positive"' })).toMatch(/not allowed/)
    expect(friendlyError({ code: "23502", message: 'null value in column "doc" violates not-null constraint' })).toMatch(/required/)
    expect(friendlyError({ code: "22P02", message: 'invalid input syntax for type uuid: "bad"' })).toMatch(/format/)
    expect(friendlyError({ code: "PGRST202", message: "Could not find the function public.save_voice_lead" })).toMatch(/database update/)
    expect(friendlyError({ code: "PGRST301", message: "JWT expired" })).toMatch(/Sign in again/)
  })

  it("explains network failures and timeouts", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/No connection/)
    expect(friendlyError({ name: "TimeoutError", message: "signal timed out" })).toMatch(/too long/)
    expect(friendlyError({ name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code" })).toMatch(/server/)
  })

  it("passes messages written for people through", () => {
    expect(friendlyError({ code: "P0001", message: "Only the Super Admin can give someone the admin role." })).toBe("Only the Super Admin can give someone the admin role.")
    expect(friendlyError({ code: "42501", message: "Only the Owner can change the Owner's account." })).toBe("Only the Owner can change the Owner's account.")
    expect(friendlyError({ code: "23514", message: "A payout cannot be linked to an invoice." })).toBe("A payout cannot be linked to an invoice.")
    expect(friendlyError(new Error("That invoice number is already used. Try again."))).toBe("That invoice number is already used. Try again.")
  })

  it("falls back when there is nothing to show", () => {
    expect(friendlyError(null, "Could not save")).toBe("Could not save")
    expect(friendlyError({}, "Could not save")).toBe("Could not save")
    expect(friendlyError("Plain text")).toBe("Plain text")
  })
})
