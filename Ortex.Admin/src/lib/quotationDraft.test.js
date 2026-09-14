import { describe, expect, it } from "vitest"
import { draftHasContent, draftKey, isDirty, saveBlocker } from "./quotationDraft"

const blank = { customer: { name: "", company: "" }, lines: [{ description: "", rate: 0 }] }

describe("quotation draft", () => {
  it("keys per user and per quotation", () => {
    expect(draftKey("u1", null)).toBe("ortex.quotationDraft.u1.new")
    expect(draftKey("u1", "q9")).toBe("ortex.quotationDraft.u1.q9")
    expect(draftKey(null, "q9")).toBe("ortex.quotationDraft.local.q9")
  })

  it("an untouched blank is not worth offering back", () => {
    expect(draftHasContent(blank)).toBe(false)
    expect(draftHasContent(null)).toBe(false)
    expect(draftHasContent({ ...blank, customer: { name: "", company: "Acme" } })).toBe(true)
    expect(draftHasContent({ ...blank, lines: [{ description: "Keychain", rate: 0 }] })).toBe(true)
    expect(draftHasContent({ ...blank, lines: [{ description: "", rate: 12 }] })).toBe(true)
  })

  it("dirty means the form moved away from what it was opened with", () => {
    expect(isDirty(blank, { ...blank })).toBe(false)
    expect(isDirty({ ...blank, notes: "x" }, blank)).toBe(true)
  })

  it("names what blocks a save", () => {
    expect(saveBlocker(blank)).toBe("Choose or add a customer")
    expect(saveBlocker({ customer: { name: "Ravi" }, lines: [] })).toBe("Add at least one line item")
    expect(saveBlocker({ customer: { company: "Acme" }, lines: [{}] })).toBeNull()
  })
})
