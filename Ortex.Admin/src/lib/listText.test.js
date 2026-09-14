// Mirrors Ortex.Mobile/test/listText.test.mjs case for case, so the two ports
// cannot drift apart unnoticed.
import { describe, expect, it } from "vitest"
import { afterChange, appendClause, BULLET, lineKind, renumber, toggleBullets, toggleNumbered } from "./listText"

describe("listText", () => {
  it("renumber keeps each run counting from its first number", () => {
    expect(renumber("1. a\n1. b\n1. c")).toBe("1. a\n2. b\n3. c")
    expect(renumber("1. a\n3. c\nplain\n5. x\n9. y")).toBe("1. a\n2. c\nplain\n5. x\n6. y")
    expect(renumber("no list here")).toBe("no list here")
  })

  it("toggleNumbered numbers the touched lines, and un-numbers them when all are numbered", () => {
    const text = "Prices ex-works\nTaxes extra"
    const on = toggleNumbered(text, 0, text.length)
    expect(on.text).toBe("1. Prices ex-works\n2. Taxes extra")
    expect(on.cursor).toBe(on.text.length)
    const off = toggleNumbered(on.text, 0, on.text.length)
    expect(off.text).toBe(text)
    // A bulleted line converts rather than stacking two markers.
    expect(toggleNumbered(`${BULLET}one`, 0, 0).text).toBe("1. one")
  })

  it("toggleBullets works on just the line under the cursor", () => {
    const e = toggleBullets("1. first\nsecond\nthird", 12, 12)
    expect(e.text).toBe(`1. first\n${BULLET}second\nthird`)
  })

  it("appendClause adds the next number on its own line", () => {
    expect(appendClause("").text).toBe("1. ")
    const e = appendClause("1. a\n2. b")
    expect(e.text).toBe("1. a\n2. b\n3. ")
    expect(e.cursor).toBe(e.text.length)
  })

  it("Enter continues a list and Enter on an empty item leaves it", () => {
    const prev = "1. Advance 50%"
    const cont = afterChange(prev, `${prev}\n`)
    expect(cont.text).toBe("1. Advance 50%\n2. ")
    expect(cont.cursor).toBe(cont.text.length)

    expect(afterChange(`${BULLET}one`, `${BULLET}one\n`).text).toBe(`${BULLET}one\n${BULLET}`)

    const exit = afterChange("1. a\n2. ", "1. a\n2. \n")
    expect(exit.text).toBe("1. a\n")
    expect(exit.cursor).toBe(5)
  })

  it("Enter in the middle of a numbered list renumbers what follows", () => {
    expect(afterChange("1. a\n2. b", "1. a\n\n2. b").text).toBe("1. a\n2. \n3. b")
  })

  it("plain typing is left alone", () => {
    expect(afterChange("Hello", "Hello!")).toBeNull()
    expect(afterChange("Line one", "Line one\n")).toBeNull()
  })

  it("lineKind reports the line under the caret", () => {
    const text = "1. a\n• b\nc"
    expect(lineKind(text, 2)).toBe("numbered")
    expect(lineKind(text, 7)).toBe("bulleted")
    expect(lineKind(text, 10)).toBeNull()
  })
})
