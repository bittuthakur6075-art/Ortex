// Plain-text list editing for quotation terms and notes (domain/listText.ts).

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { toggleNumbered, toggleBullets, appendClause, afterChange, renumber, BULLET } = await loadTs("domain/listText.ts")

test("renumber keeps each run counting from its first number", () => {
  assert.equal(renumber("1. a\n1. b\n1. c"), "1. a\n2. b\n3. c")
  assert.equal(renumber("1. a\n3. c\nplain\n5. x\n9. y"), "1. a\n2. c\nplain\n5. x\n6. y")
  assert.equal(renumber("no list here"), "no list here")
})

test("toggleNumbered numbers the touched lines, and un-numbers them when all are numbered", () => {
  const text = "Prices ex-works\nTaxes extra"
  const on = toggleNumbered(text, 0, text.length)
  assert.equal(on.text, "1. Prices ex-works\n2. Taxes extra")
  assert.equal(on.cursor, on.text.length)
  const off = toggleNumbered(on.text, 0, on.text.length)
  assert.equal(off.text, text)
  // A bulleted line converts rather than stacking two markers.
  assert.equal(toggleNumbered(`${BULLET}one`, 0, 0).text, "1. one")
})

test("toggleBullets works on just the line under the cursor", () => {
  const text = "1. first\nsecond\nthird"
  const e = toggleBullets(text, 12, 12)
  assert.equal(e.text, `1. first\n${BULLET}second\nthird`)
})

test("appendClause adds the next number on its own line", () => {
  assert.equal(appendClause("").text, "1. ")
  const e = appendClause("1. a\n2. b")
  assert.equal(e.text, "1. a\n2. b\n3. ")
  assert.equal(e.cursor, e.text.length)
})

test("Enter continues a list and Enter on an empty item leaves it", () => {
  const prev = "1. Advance 50%"
  const cont = afterChange(prev, `${prev}\n`)
  assert.equal(cont.text, "1. Advance 50%\n2. ")
  assert.equal(cont.cursor, cont.text.length)

  const bullet = afterChange(`${BULLET}one`, `${BULLET}one\n`)
  assert.equal(bullet.text, `${BULLET}one\n${BULLET}`)

  const exit = afterChange("1. a\n2. ", "1. a\n2. \n")
  assert.equal(exit.text, "1. a\n")
  assert.equal(exit.cursor, 5)
})

test("Enter in the middle of a numbered list renumbers what follows", () => {
  const prev = "1. a\n2. b"
  const next = "1. a\n\n2. b"
  const e = afterChange(prev, next)
  assert.equal(e.text, "1. a\n2. \n3. b")
})

test("plain typing is left alone", () => {
  assert.equal(afterChange("Hello", "Hello!"), null)
  assert.equal(afterChange("Line one", "Line one\n"), null)
})
