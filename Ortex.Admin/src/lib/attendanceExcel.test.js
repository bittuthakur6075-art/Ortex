// The attendance workbook, built for real and read back from the bytes.
//
// These tests exist because the first version shipped unlooked-at and the file
// was a mess: the day grid set columns B onward to width 4, which were the same
// columns the summary table used, so every header read "R", "Ho", "ay" and the
// hours showed as ###. Asserting the widths is the point, not a detail.

import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import { buildAttendanceWorkbook, monthTab, monthTitle } from "./attendanceExcel"

const person = (id, name, over = {}) => ({
  user_id: id,
  name,
  role: "staff",
  present: 20,
  field: 0,
  half_days: 1,
  absent: 2,
  missed: 0,
  weekly_off: 4,
  holidays: 1,
  leave: 2,
  lop: 0,
  lates: 3,
  late_penalty: 0.5,
  worked_min: 9660, // 161 h
  payable: 27.5,
  ...over,
})

const dayList = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`)

const MONTH = {
  month: "2026-09",
  summary: [person("u1", "Bittu Thakur"), person("u2", "Pradeep Kumar Sharma", { absent: 0, worked_min: 10200 })],
  days: [
    { user_id: "u1", day: "2026-09-01", status: "P", worked_min: 540 },
    { user_id: "u1", day: "2026-09-02", status: "A" },
    { user_id: "u1", day: "2026-09-03", status: "HD", late: true, late_min: 42, worked_min: 250 },
    { user_id: "u1", day: "2026-09-06", status: "WO" },
    { user_id: "u2", day: "2026-09-01", status: "OD", override_status: "P" },
  ],
  dayList,
  holidays: new Set(["2026-09-05"]),
  weeklyOff: new Set([0]),
  overtime: { u1: 300, u2: 0 },
  locked: false,
}

/** Build, write to bytes, read back: what Excel would actually open. */
async function roundTrip(opts = {}) {
  const wb = buildAttendanceWorkbook(ExcelJS, { months: [MONTH], withOvertime: true, ...opts })
  const buf = await wb.xlsx.writeBuffer()
  const back = new ExcelJS.Workbook()
  await back.xlsx.load(buf)
  return back
}

describe("attendance workbook", () => {
  it("names the month in words and in the tab", () => {
    expect(monthTitle("2026-09")).toBe("September 2026")
    expect(monthTab("2026-09")).toBe("Sep 2026")
    // Excel refuses a sheet name over 31 characters.
    expect(`${monthTab("2026-09")} days`.length).toBeLessThanOrEqual(31)
  })

  it("puts the summary and the grid on SEPARATE sheets", async () => {
    const wb = await roundTrip()
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Sep 2026", "Sep 2026 days", "Legend"])
  })

  it("keeps every summary column wide enough to read", async () => {
    const wb = await roundTrip()
    const ws = wb.getWorksheet("Sep 2026")
    // The bug: the grid squashed these to 4. Nothing here may be narrow again.
    for (let c = 1; c <= 16; c += 1) {
      expect(ws.getColumn(c).width, `column ${c}`).toBeGreaterThanOrEqual(9)
    }
    expect(ws.getColumn(1).width).toBeGreaterThanOrEqual(20) // the name
  })

  it("heads the summary with words, not bare codes", async () => {
    const wb = await roundTrip()
    const ws = wb.getWorksheet("Sep 2026")
    const text = (cell) => (typeof cell.value === "object" && cell.value?.richText ? cell.value.richText.map((r) => r.text).join("") : String(cell.value ?? ""))
    const heads = []
    for (let c = 1; c <= 16; c += 1) heads.push(text(ws.getCell(6, c)))
    expect(heads[0]).toBe("Person")
    expect(heads[2]).toContain("Present")
    expect(heads[6]).toContain("No check-out")
    expect(heads[13]).toContain("Hours worked")
    // The grid's letter rides along under the word.
    expect(heads[2]).toContain("P")
    expect(heads[5]).toContain("A")
  })

  it("writes the figures, with hours converted from minutes", async () => {
    const wb = await roundTrip()
    const ws = wb.getWorksheet("Sep 2026")
    expect(ws.getCell(7, 1).value).toBe("Bittu Thakur")
    expect(ws.getCell(7, 4 + 2).value).toBe(2) // absent
    expect(ws.getCell(7, 14).value).toBe(161) // 9660 min
    expect(ws.getCell(7, 15).value).toBe(5) // 300 min overtime
  })

  it("totals with a live formula that already carries its answer", async () => {
    const wb = await roundTrip()
    const ws = wb.getWorksheet("Sep 2026")
    const total = ws.getCell(9, 3) // two people, so row 9
    expect(total.value.formula).toBe("SUM(C7:C8)")
    expect(total.value.result).toBe(40)
    expect(String(ws.getCell(9, 1).value)).toContain("2 people")
  })

  it("gives the days sheet a weekday letter over every date", async () => {
    const wb = await roundTrip()
    const ws = wb.getWorksheet("Sep 2026 days")
    // 1 Sep 2026 is a Tuesday.
    expect(ws.getCell(6, 2).value).toBe("T")
    expect(ws.getCell(7, 2).value).toBe(1)
    expect(ws.getCell(7, 31).value).toBe(30)
    expect(ws.getColumn(2).width).toBeLessThan(6) // narrow, and only on THIS sheet
  })

  it("draws each day's status, preferring an override", async () => {
    const wb = await roundTrip()
    const ws = wb.getWorksheet("Sep 2026 days")
    expect(ws.getCell(8, 1).value).toBe("Bittu Thakur")
    expect(ws.getCell(8, 2).value).toBe("P")
    expect(ws.getCell(8, 3).value).toBe("A")
    expect(ws.getCell(8, 4).value).toBe("HD")
    expect(ws.getCell(8, 5).value).toBe("") // nothing recorded
    // u2's 1 Sep is OD but overridden to P: the override wins.
    expect(ws.getCell(9, 2).value).toBe("P")
  })

  it("colours the grid by value, so an edited letter recolours itself", async () => {
    const wb = await roundTrip()
    const ws = wb.getWorksheet("Sep 2026 days")
    const cf = ws.conditionalFormattings
    expect(cf.length).toBeGreaterThan(0)
    const rules = cf[0].rules
    expect(rules.length).toBe(9) // one per status
    const present = rules.find((r) => r.formulae?.[0] === '"P"')
    expect(present.style.font.color.argb).toBe("FF1B6B41") // the console's emerald
  })

  it("drops the overtime column entirely when the exporter may not see it", async () => {
    const wb = await roundTrip({ withOvertime: false })
    const ws = wb.getWorksheet("Sep 2026")
    const text = (cell) => (typeof cell.value === "object" && cell.value?.richText ? cell.value.richText.map((r) => r.text).join("") : String(cell.value ?? ""))
    const heads = []
    for (let c = 1; c <= 16; c += 1) heads.push(text(ws.getCell(6, c)))
    expect(heads.join("|")).not.toContain("Overtime")
    expect(heads[14]).toContain("Payable")
  })

  it("explains itself on the Legend sheet", async () => {
    const wb = await roundTrip()
    const ws = wb.getWorksheet("Legend")
    const all = []
    ws.eachRow((row) => row.eachCell((c) => all.push(String(c.value ?? ""))))
    const text = all.join(" ")
    expect(text).toContain("Did not check out")
    expect(text).toContain("Missed punch")
    expect(text).toContain("counts FROM the shift start")
    expect(text).toContain("Payable days")
  })

  it("survives a month with nobody in it", async () => {
    const wb = buildAttendanceWorkbook(ExcelJS, {
      months: [{ ...MONTH, summary: [], days: [] }],
      withOvertime: true,
    })
    // The summary sheet still exists; the grid sheet is not worth making.
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Sep 2026", "Legend"])
  })
})
