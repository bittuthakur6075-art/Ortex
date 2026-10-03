// The attendance register as a workbook: per month a Summary sheet and a Days
// sheet, then one Legend at the end.
//
// TWO SHEETS PER MONTH, not one. A column has a single width for its whole
// sheet, and the two tables want opposite things: the summary needs sixteen
// readable columns, the grid needs thirty-one narrow ones. Putting them on one
// sheet squashed every summary column to 4 characters, so the headers read
// "R", "Ho", "ay" and the hours showed as ###. Splitting them is the only fix
// that keeps both legible.
//
// ExcelJS, not the `xlsx` package the imports use: SheetJS's community build
// writes values but cannot write cell formats, and a register with no type
// hierarchy, no rules and no frozen panes is a CSV with a different extension.
// The library is ~900 KB, so it is imported only when someone asks for a file.
//
// The look is the console's, carried into a spreadsheet: white paper with the
// worksheet gridlines turned off, one dark ink for text, hairline rules instead
// of boxed cells, and space doing the work that borders used to. No fills
// except the pale status tints, which carry meaning rather than decoration.
//
// `buildAttendanceWorkbook` is pure and returns the workbook, so the tests
// build a real file and read it back. `downloadAttendanceWorkbook` is the thin
// browser wrapper.

import { countsAsLate, STATUS_LABEL, STATUS_TONE } from "./attendance"

// One palette for the whole workbook. ARGB, as ExcelJS wants it.
const INK = "FF11161F"
const MUTED = "FF79818F"
const FAINT = "FFAAB1BC"
const RULE = "FFE6E9EF"
const STRONG_RULE = "FFB9C0CC"
// Aptos Narrow is Excel's own default from 2024 and falls back cleanly to
// Calibri on older installs. Naming it keeps the file from rendering in
// whatever the reader's theme happens to be.
const FONT = "Aptos Narrow"

/**
 * A status's colour comes from STATUS_TONE, the same map the console tints its
 * badges with, so P is the same green on screen and in the file and a status
 * added later arrives with its colour already decided. The tints are pale on
 * purpose: the letter must stay legible in print and on a photocopy, and thirty
 * saturated squares a row is a heat map nobody asked for. `text` is the
 * AA-contrast ink for a letter sitting on `fill`.
 */
const TONE = {
  emerald: { fill: "FFEAF5EE", text: "FF1B6B41" },
  cyan: { fill: "FFE9F1F9", text: "FF1A5580" },
  amber: { fill: "FFFDF3E2", text: "FF8A5A00" },
  rose: { fill: "FFFBEAEA", text: "FF9B2020" },
  violet: { fill: "FFF0EDF9", text: "FF4B3F8C" },
  blue: { fill: "FFEAF2FA", text: "FF1A5580" },
  slate: { fill: "FFF4F5F7", text: "FF6B7280" },
}

const toneOf = (status) => TONE[STATUS_TONE[status]] || TONE.slate
const STATUS_CODES = Object.keys(STATUS_LABEL)

const hair = { style: "thin", color: { argb: RULE } }
const underline = { bottom: { style: "thin", color: { argb: STRONG_RULE } } }

const MONTH_WORDS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"]

/** "2026-09" → "September 2026". */
export function monthTitle(month) {
  const [y, m] = String(month).split("-").map(Number)
  return `${MONTH_WORDS[(m || 1) - 1]} ${y}`
}

/** "2026-09" → "Sep 2026", which also fits Excel's 31-character sheet names. */
export function monthTab(month) {
  const [y, m] = String(month).split("-").map(Number)
  return `${MONTH_WORDS[(m || 1) - 1].slice(0, 3)} ${y}`
}

const hoursOf = (min) => Math.round((Number(min) || 0) / 6) / 10

// A zero prints as an en dash. A column of noughts is noise; the eye should
// land on the days that actually happened.
const COUNT = '0;-0;"–"'
const DAYS = '0.0" d";-0.0" d";"–"'
const HOURS = '0.0" h";-0.0" h";"–"'

/**
 * The summary columns. Headers are WORDS, not the one and two letter codes the
 * grid uses: a column headed "MP" means nothing to someone opening the file for
 * the first time, and the note that explained it was invisible until hovered.
 * `code` is shown under the word, small, so the header also teaches the letter
 * used in the grid.
 */
const COLUMNS = [
  // NEVER exactly 9: that is ExcelJS's default width, and a column set to the
  // default is not written to the file at all, so it reopens as whatever the
  // reader's Excel decides.
  { key: "name", header: "Person", width: 26, align: "left" },
  { key: "role", header: "Role", width: 13, align: "left" },
  { key: "present", header: "Present", code: "P", width: 10.5, numFmt: COUNT },
  { key: "field", header: "On duty", code: "OD", width: 10.5, numFmt: COUNT },
  { key: "half_days", header: "Half day", code: "HD", width: 10.5, numFmt: COUNT },
  { key: "absent", header: "Absent", code: "A", width: 10.5, numFmt: COUNT },
  // Days left open: A flagged "Did not check out" (and MP on older rows). No
  // letter of its own in the grid, so no code under the word.
  { key: "missed", header: "No check-out", width: 12, numFmt: COUNT },
  { key: "weekly_off", header: "Weekly off", code: "WO", width: 11.5, numFmt: COUNT },
  { key: "holidays", header: "Holiday", code: "H", width: 10.5, numFmt: COUNT },
  { key: "leave", header: "Leave", code: "L", width: 10.5, numFmt: COUNT },
  { key: "lop", header: "Loss of pay", code: "LOP", width: 11.5, numFmt: COUNT },
  { key: "lates", header: "Lates", width: 10.5, numFmt: COUNT },
  { key: "late_penalty", header: "Late penalty", width: 12, numFmt: DAYS },
  { key: "hours", header: "Hours worked", width: 13, numFmt: HOURS },
  { key: "overtime", header: "Overtime", width: 11.5, numFmt: HOURS },
  { key: "payable", header: "Payable days", width: 12.5, numFmt: DAYS },
]

/**
 * Build the workbook.
 *
 * `months` is [{ month, summary, days, dayList, holidays, weeklyOff, overtime }]
 * in the order the sheets should appear. `withOvertime` false drops that column
 * entirely, so a file made by someone who may not see overtime does not carry
 * an empty column hinting that it exists.
 */
export function buildAttendanceWorkbook(ExcelJS, { company = "Ortex Industries", months, withOvertime = false, roleLabel = (r) => r }) {
  const wb = new ExcelJS.Workbook()
  wb.creator = company
  wb.created = new Date()

  const columns = COLUMNS.filter((c) => c.key !== "overtime" || withOvertime)

  for (const m of months) {
    summarySheet(wb, { ...m, company, columns, roleLabel })
    if (m.dayList?.length && (m.summary || []).length) daysSheet(wb, { ...m, company })
  }
  legendSheet(wb, withOvertime)
  return wb
}

/** Build and save. The browser half, kept apart so the builder stays testable. */
export async function downloadAttendanceWorkbook({ filename, ...opts }) {
  const mod = await import("exceljs")
  const ExcelJS = mod.default || mod
  const wb = buildAttendanceWorkbook(ExcelJS, opts)
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  )
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** The title block both sheets carry. Returns the next free row. */
function titleBlock(ws, { company, line2, line3, span }) {
  ws.mergeCells(2, 1, 2, span)
  const t1 = ws.getCell(2, 1)
  t1.value = company
  t1.font = { name: FONT, size: 18, bold: true, color: { argb: INK } }
  t1.alignment = { vertical: "middle", horizontal: "left" }
  ws.getRow(2).height = 28

  ws.mergeCells(3, 1, 3, span)
  const t2 = ws.getCell(3, 1)
  t2.value = line2
  t2.font = { name: FONT, size: 12, color: { argb: INK } }
  t2.alignment = { vertical: "middle", horizontal: "left" }
  ws.getRow(3).height = 19

  ws.mergeCells(4, 1, 4, span)
  const t3 = ws.getCell(4, 1)
  t3.value = line3
  t3.font = { name: FONT, size: 9, color: { argb: MUTED } }
  t3.alignment = { vertical: "middle", horizontal: "left" }
  ws.getRow(4).height = 16
  ws.getRow(5).height = 8
  return 6
}

const stamp = () => new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })

function summarySheet(wb, { month, summary, overtime, locked, company, columns, roleLabel }) {
  const rows = summary || []
  const headRow = 6
  const ws = wb.addWorksheet(monthTab(month), {
    views: [{ state: "frozen", xSplit: 1, ySplit: headRow, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  })
  ws.properties.defaultRowHeight = 20

  const span = columns.length
  titleBlock(ws, {
    company,
    line2: `Attendance summary  ·  ${monthTitle(month)}${locked ? "  ·  Locked for payroll" : ""}`,
    line3: `${rows.length} ${rows.length === 1 ? "person" : "people"}  ·  each figure is a count of days unless it says hours  ·  generated ${stamp()}`,
    span,
  })

  // The header carries the word AND the grid's letter underneath it, so this
  // sheet explains the other one without anybody opening the Legend.
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width
    const cell = ws.getCell(headRow, i + 1)
    cell.value = c.code
      ? { richText: [{ text: c.header, font: { name: FONT, size: 10, bold: true, color: { argb: INK } } }, { text: `\n${c.code}`, font: { name: FONT, size: 8, color: { argb: MUTED } } }] }
      : c.header
    if (!c.code) cell.font = { name: FONT, size: 10, bold: true, color: { argb: INK } }
    cell.alignment = { vertical: "bottom", horizontal: c.align === "left" ? "left" : "center", wrapText: true }
    cell.border = underline
  })
  ws.getRow(headRow).height = 32

  rows.forEach((r, n) => {
    const rowIndex = headRow + 1 + n
    ws.getRow(rowIndex).height = 20
    const values = {
      ...r,
      role: roleLabel(r.role),
      hours: hoursOf(r.worked_min),
      overtime: hoursOf(overtime?.[r.user_id] || 0),
      late_penalty: Number(r.late_penalty) || 0,
      payable: Number(r.payable) || 0,
    }
    columns.forEach((c, i) => {
      const cell = ws.getCell(rowIndex, i + 1)
      const v = values[c.key]
      cell.value = c.align === "left" ? (v ?? "") : Number(v) || 0
      // The name anchors the row and the payable figure closes it. Everything
      // between is regular weight, so two things stand out instead of sixteen.
      const strong = c.key === "name" || c.key === "payable"
      let colour = c.align === "left" && c.key !== "name" ? MUTED : INK
      if (c.key === "absent" && Number(v) > 0) colour = toneOf("A").text
      if (c.key === "missed" && Number(v) > 0) colour = toneOf("MP").text
      cell.font = { name: FONT, size: 10, bold: strong, color: { argb: colour } }
      cell.alignment = { vertical: "middle", horizontal: c.align === "left" ? "left" : "center" }
      cell.border = { bottom: hair }
      if (c.numFmt) cell.numFmt = c.numFmt
    })
  })

  // Totals as live SUM formulas, so the row survives a filter or an edit.
  if (rows.length) {
    const first = headRow + 1
    const last = headRow + rows.length
    const totalRow = last + 1
    ws.getRow(totalRow).height = 22
    columns.forEach((c, i) => {
      const cell = ws.getCell(totalRow, i + 1)
      const letter = ws.getColumn(i + 1).letter
      if (i === 0) cell.value = `Total · ${rows.length} people`
      else if (c.align !== "left") {
        // `result` matters: without it Excel shows a blank until it recalculates,
        // and LibreOffice and most viewers show nothing at all.
        const sum = rows.reduce((t, r) => {
          const v =
            c.key === "hours"
              ? hoursOf(r.worked_min)
              : c.key === "overtime"
                ? hoursOf(overtime?.[r.user_id] || 0)
                : Number(r[c.key]) || 0
          return t + v
        }, 0)
        cell.value = { formula: `SUM(${letter}${first}:${letter}${last})`, result: Math.round(sum * 10) / 10 }
      }
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: INK } }
      cell.alignment = { vertical: "middle", horizontal: c.align === "left" ? "left" : "center" }
      cell.border = { top: { style: "thin", color: { argb: STRONG_RULE } } }
      if (c.numFmt) cell.numFmt = c.numFmt
    })
    ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: last, column: span } }
  }
  return ws
}

function daysSheet(wb, { month, summary, days, dayList, holidays, weeklyOff, company }) {
  const rows = summary || []
  const nameCol = 1
  const firstDayCol = 2
  const weekdayRow = 6
  const dateRow = 7
  const ws = wb.addWorksheet(`${monthTab(month)} days`, {
    views: [{ state: "frozen", xSplit: 1, ySplit: dateRow, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  })
  ws.properties.defaultRowHeight = 20
  ws.getColumn(nameCol).width = 26

  const span = dayList.length + 1
  titleBlock(ws, {
    company,
    line2: `Day by day  ·  ${monthTitle(month)}`,
    line3: "A blank square is a day with nothing recorded. Grey dates are weekly offs and holidays. Hover a square for the late minutes. The letters are explained on the Legend sheet.",
    span,
  })

  // A weekday letter over every date. Without it nobody can tell which columns
  // are the weekends, and a month of thirty letters is unreadable.
  const wd = ws.getCell(weekdayRow, nameCol)
  wd.value = ""
  wd.border = { bottom: hair }
  ws.getRow(weekdayRow).height = 16

  const nameCell = ws.getCell(dateRow, nameCol)
  nameCell.value = "Person"
  nameCell.font = { name: FONT, size: 10, bold: true, color: { argb: INK } }
  nameCell.alignment = { vertical: "bottom", horizontal: "left" }
  nameCell.border = underline
  ws.getRow(dateRow).height = 20

  dayList.forEach((d, i) => {
    const col = firstDayCol + i
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay()
    const off = holidays?.has?.(d) || weeklyOff?.has?.(dow)
    ws.getColumn(col).width = 4.3

    const w = ws.getCell(weekdayRow, col)
    w.value = WEEKDAY_LETTER[dow]
    w.font = { name: FONT, size: 8, color: { argb: off ? FAINT : MUTED } }
    w.alignment = { vertical: "bottom", horizontal: "center" }
    w.border = { bottom: hair }

    const cell = ws.getCell(dateRow, col)
    cell.value = Number(d.slice(8, 10))
    cell.font = { name: FONT, size: 10, bold: !off, color: { argb: off ? FAINT : INK } }
    cell.alignment = { vertical: "bottom", horizontal: "center" }
    cell.border = underline
  })

  const byCell = new Map()
  for (const d of days || []) byCell.set(`${d.user_id}|${d.day}`, d)

  rows.forEach((r, n) => {
    const rowIndex = dateRow + 1 + n
    ws.getRow(rowIndex).height = 20
    const who = ws.getCell(rowIndex, nameCol)
    who.value = r.name
    who.font = { name: FONT, size: 10, color: { argb: INK } }
    who.alignment = { vertical: "middle", horizontal: "left" }
    who.border = { bottom: hair }
    dayList.forEach((d, i) => {
      const e = byCell.get(`${r.user_id}|${d}`)
      const status = e ? e.override_status || e.status : ""
      const cell = ws.getCell(rowIndex, firstDayCol + i)
      cell.value = status
      // No colour is painted on the cell: the conditional formatting below
      // colours it from its VALUE, so correcting a letter in Excel recolours
      // the square instead of leaving a green cell reading A.
      cell.font = { name: FONT, size: 9, bold: true, color: { argb: MUTED } }
      cell.alignment = { vertical: "middle", horizontal: "center" }
      cell.border = { bottom: hair }
      const note = []
      if (e && countsAsLate(e)) note.push(`Late by ${e.late_min} min`)
      if (e?.worked_min) note.push(`${hoursOf(e.worked_min)} h worked`)
      if (note.length) cell.note = note.join("\n")
    })
  })

  const from = ws.getColumn(firstDayCol).letter
  const to = ws.getColumn(firstDayCol + dayList.length - 1).letter
  ws.addConditionalFormatting({
    ref: `${from}${dateRow + 1}:${to}${dateRow + rows.length}`,
    rules: STATUS_CODES.map((code, i) => ({
      type: "cellIs",
      operator: "equal",
      formulae: [`"${code}"`],
      priority: i + 1,
      style: {
        fill: { type: "pattern", pattern: "solid", bgColor: { argb: toneOf(code).fill } },
        font: { color: { argb: toneOf(code).text }, bold: true },
      },
    })),
  })

  // A compact legend right under the grid, so nobody has to leave the sheet to
  // read it. The full explanations stay on the Legend sheet.
  const legendRow = dateRow + rows.length + 2
  const key = ws.getCell(legendRow, nameCol)
  key.value = "Key"
  key.font = { name: FONT, size: 9, bold: true, color: { argb: MUTED } }
  STATUS_CODES.forEach((code, i) => {
    const cell = ws.getCell(legendRow, firstDayCol + i * 3)
    cell.value = code
    cell.font = { name: FONT, size: 9, bold: true, color: { argb: toneOf(code).text } }
    cell.alignment = { horizontal: "center", vertical: "middle" }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: toneOf(code).fill } }
    const label = ws.getCell(legendRow, firstDayCol + i * 3 + 1)
    label.value = STATUS_LABEL[code]
    label.font = { name: FONT, size: 9, color: { argb: MUTED } }
    label.alignment = { horizontal: "left", vertical: "middle" }
  })
  return ws
}

function legendSheet(wb, withOvertime) {
  const ws = wb.addWorksheet("Legend", { views: [{ showGridLines: false }] })
  ws.getColumn(1).width = 8
  ws.getColumn(2).width = 24
  ws.getColumn(3).width = 86
  ws.properties.defaultRowHeight = 20

  ws.getCell(2, 1).value = "How to read this workbook"
  ws.getCell(2, 1).font = { name: FONT, size: 16, bold: true, color: { argb: INK } }
  ws.getRow(2).height = 26

  ws.mergeCells(3, 1, 3, 3)
  ws.getCell(3, 1).value =
    "Every month has two sheets: a Summary of each person's days and hours, and a Days sheet showing the month square by square."
  ws.getCell(3, 1).font = { name: FONT, size: 10, color: { argb: MUTED } }

  ws.getCell(5, 1).value = "What the letters mean"
  ws.getCell(5, 1).font = { name: FONT, size: 12, bold: true, color: { argb: INK } }

  const notes = {
    P: "A full day worked.",
    HD: "Worked, but under the half-day threshold in Attendance settings.",
    A: "No attendance, or a check-in never checked out before midnight (marked Did not check out, counted in No check-out). A correction fixes it.",
    OD: "Every punch that day was made in the field, away from a station.",
    WO: "Weekly off.",
    H: "A company holiday.",
    MP: "An older status for a day left open, used before 30 Sep 2026. Such days are now A, Did not check out.",
    L: "Approved leave.",
    LOP: "Leave without pay.",
  }

  let row = 6
  for (const [code, label] of Object.entries(STATUS_LABEL)) {
    ws.getRow(row).height = 21
    const a = ws.getCell(row, 1)
    a.value = code
    a.font = { name: FONT, size: 10, bold: true, color: { argb: toneOf(code).text } }
    a.alignment = { horizontal: "center", vertical: "middle" }
    a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: toneOf(code).fill } }
    const b = ws.getCell(row, 2)
    b.value = label
    b.font = { name: FONT, size: 10, bold: true, color: { argb: INK } }
    b.alignment = { vertical: "middle" }
    b.border = { bottom: hair }
    const c = ws.getCell(row, 3)
    c.value = notes[code] || ""
    c.font = { name: FONT, size: 10, color: { argb: MUTED } }
    c.alignment = { vertical: "middle" }
    c.border = { bottom: hair }
    row += 1
  }

  row += 1
  ws.getCell(row, 1).value = "How the figures are worked out"
  ws.getCell(row, 1).font = { name: FONT, size: 12, bold: true, color: { argb: INK } }
  row += 1

  const lines = [
    "Hours worked are the minutes between each check-in and check-out, shown to one decimal.",
    "A check-in before the shift starts counts FROM the shift start, so arriving early does not bank time.",
    "A day that was never checked out is an absence, with the check-in kept on the record. A correction is the way to fix it.",
    "Payable days = P + OD + WO + H + L, half of each HD (and of MP on older records), less the late penalty.",
    withOvertime
      ? "Overtime is the time past the shift on a working day, and every worked minute on a holiday or a weekly off."
      : "Overtime is recorded but not shown here: it appears only in a file exported by someone who may see overtime (Register or Payroll).",
    "A dash means nothing to count. A blank square on the Days sheet means no record for that day.",
  ]
  for (const line of lines) {
    ws.mergeCells(row, 1, row, 3)
    const cell = ws.getCell(row, 1)
    cell.value = line
    cell.font = { name: FONT, size: 10, color: { argb: MUTED } }
    cell.alignment = { vertical: "middle", horizontal: "left" }
    ws.getRow(row).height = 19
    row += 1
  }
  return ws
}
