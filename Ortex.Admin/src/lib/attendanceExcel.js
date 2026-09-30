// The attendance register as a workbook: one sheet per month, each with a
// title block, a summary table per person and the people x days grid
// underneath, then a legend sheet.
//
// ExcelJS, not the `xlsx` package the imports use: SheetJS's community build
// writes values but cannot write cell formats, and a register with no type
// hierarchy, no rules and no frozen panes is a CSV with a different extension.
// The library is ~800 KB, so it is imported only when someone asks for a file.
//
// The look is the console's, carried into a spreadsheet: white paper with the
// worksheet gridlines turned OFF, one dark ink for text, hairline rules instead
// of boxed cells, and space doing the work that borders used to. No fills
// except the pale status tints in the grid, which carry meaning rather than
// decoration. Nothing here is shaded, outlined twice or graduated.
//
// Everything is pure: the caller gathers the months and hands them over, which
// keeps this file testable and off the page's critical path.

import { STATUS_LABEL, STATUS_TONE } from "./attendance"

// One palette for the whole workbook. ARGB, as ExcelJS wants it.
const INK = "FF11161F"
const MUTED = "FF79818F"
const RULE = "FFE6E9EF"
const STRONG_RULE = "FFB9C0CC"
// Aptos Narrow is Excel's own default from 2024 and falls back cleanly to
// Calibri on older installs. Naming it keeps the file from rendering in
// whatever the reader's theme happens to be.
const FONT = "Aptos Narrow"

/**
 * A status's colour is NOT written out here status by status. It comes from
 * STATUS_TONE, the same map the console tints its badges with, so P is the same
 * green on screen and in the file, and a status added later arrives with its
 * colour already decided instead of printing grey until someone remembers this
 * file. Only the tone names need a spreadsheet-safe pair.
 *
 * The tints are deliberately pale: the letter must stay legible in print and on
 * a photocopy, and thirty saturated squares a row is a heat map nobody asked
 * for. `text` is the AA-contrast ink for a letter sitting on `fill`.
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
const DECIMAL = '0.0;-0.0;"–"'

// The summary columns, in the order an accountant reads them: who, then the
// days that make up the month, then the hours, then what is payable.
const COLUMNS = [
  { key: "name", header: "Person", width: 28, align: "left" },
  { key: "role", header: "Role", width: 15, align: "left" },
  { key: "present", header: "P", width: 5.6, hint: "Present", numFmt: COUNT },
  { key: "field", header: "OD", width: 5.6, hint: "On duty (field)", numFmt: COUNT },
  { key: "half_days", header: "HD", width: 5.6, hint: "Half day", numFmt: COUNT },
  { key: "absent", header: "A", width: 5.6, hint: "Absent", numFmt: COUNT },
  { key: "missed", header: "MP", width: 5.6, hint: "Missed punch", numFmt: COUNT },
  { key: "weekly_off", header: "WO", width: 5.6, hint: "Weekly off", numFmt: COUNT },
  { key: "holidays", header: "H", width: 5.6, hint: "Holiday", numFmt: COUNT },
  { key: "leave", header: "L", width: 5.6, hint: "Leave", numFmt: COUNT },
  { key: "lop", header: "LOP", width: 6.4, hint: "Loss of pay", numFmt: COUNT },
  { key: "lates", header: "Lates", width: 8, numFmt: COUNT },
  { key: "late_penalty", header: "Penalty", width: 9, numFmt: DECIMAL },
  { key: "hours", header: "Hours", width: 9, numFmt: DECIMAL },
  { key: "overtime", header: "Overtime", width: 10, numFmt: DECIMAL },
  { key: "payable", header: "Payable", width: 11, numFmt: DECIMAL },
]

/**
 * Build and download the workbook.
 *
 * `months` is [{ month, summary, days, dayList, holidays, weeklyOff, overtime }]
 * in the order the sheets should appear. `withOvertime` false drops that column
 * entirely, so a file made by someone who may not see overtime does not carry
 * an empty column hinting that it exists.
 */
export async function downloadAttendanceWorkbook({
  filename,
  company = "Ortex Industries",
  months,
  withOvertime = false,
  roleLabel = (r) => r,
}) {
  const mod = await import("exceljs")
  const ExcelJS = mod.default || mod
  const wb = new ExcelJS.Workbook()
  wb.creator = company
  wb.created = new Date()

  const columns = COLUMNS.filter((c) => c.key !== "overtime" || withOvertime)

  for (const m of months) sheetFor(wb, { ...m, company, columns, roleLabel })
  legendSheet(wb, withOvertime)

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

function sheetFor(wb, { month, summary, days, dayList, holidays, weeklyOff, overtime, locked, company, columns, roleLabel }) {
  const rows = summary || []
  const headRow = 6
  const ws = wb.addWorksheet(monthTab(month), {
    // Gridlines off is most of the difference between a spreadsheet and a
    // document. What is left is only the rules this file draws on purpose.
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

  // ---- title block. Type, not a coloured band. ----
  ws.mergeCells(2, 1, 2, span)
  const t1 = ws.getCell(2, 1)
  t1.value = company
  t1.font = { name: FONT, size: 20, bold: true, color: { argb: INK } }
  t1.alignment = { vertical: "middle", horizontal: "left" }
  ws.getRow(2).height = 30

  ws.mergeCells(3, 1, 3, span)
  const t2 = ws.getCell(3, 1)
  t2.value = `Attendance register  ·  ${monthTitle(month)}${locked ? "  ·  Locked for payroll" : ""}`
  t2.font = { name: FONT, size: 12, color: { argb: INK } }
  t2.alignment = { vertical: "middle", horizontal: "left" }
  ws.getRow(3).height = 20

  ws.mergeCells(4, 1, 4, span)
  const t3 = ws.getCell(4, 1)
  t3.value = `${rows.length} ${rows.length === 1 ? "person" : "people"}  ·  generated ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
  t3.font = { name: FONT, size: 9, color: { argb: MUTED } }
  t3.alignment = { vertical: "middle", horizontal: "left" }
  ws.getRow(5).height = 10

  // ---- summary table ----
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width
    const cell = ws.getCell(headRow, i + 1)
    cell.value = c.header
    cell.font = { name: FONT, size: 9, bold: true, color: { argb: MUTED } }
    cell.alignment = { vertical: "bottom", horizontal: c.align === "left" ? "left" : "center" }
    cell.border = underline
    if (c.hint) cell.note = `${c.hint} (${c.header})`
  })
  ws.getRow(headRow).height = 22

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
      // The name anchors the row, the payable figure closes it. Everything
      // between is regular weight, so two things stand out instead of sixteen.
      const strong = c.key === "name" || c.key === "payable"
      let colour = c.align === "left" && c.key !== "name" ? MUTED : INK
      // The two counts that start a conversation wear their own status colour,
      // taken from the same tone map as everything else.
      if (c.key === "absent" && Number(v) > 0) colour = toneOf("A").text
      if (c.key === "missed" && Number(v) > 0) colour = toneOf("MP").text
      cell.font = { name: FONT, size: 10, bold: strong, color: { argb: colour } }
      cell.alignment = { vertical: "middle", horizontal: c.align === "left" ? "left" : "center" }
      cell.border = { bottom: hair }
      if (c.numFmt) cell.numFmt = c.numFmt
    })
  })

  // Totals. SUM formulas rather than numbers: the file stays alive if somebody
  // filters or edits a row.
  if (rows.length) {
    const first = headRow + 1
    const last = headRow + rows.length
    const totalRow = last + 1
    ws.getRow(totalRow).height = 22
    columns.forEach((c, i) => {
      const cell = ws.getCell(totalRow, i + 1)
      const letter = ws.getColumn(i + 1).letter
      if (i === 0) cell.value = "Total"
      else if (c.align !== "left") cell.value = { formula: `SUM(${letter}${first}:${letter}${last})` }
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: INK } }
      cell.alignment = { vertical: "middle", horizontal: c.align === "left" ? "left" : "center" }
      cell.border = { top: { style: "thin", color: { argb: STRONG_RULE } } }
      if (c.numFmt) cell.numFmt = c.numFmt
    })
    ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: last, column: span } }
  }

  // ---- the day grid ----
  if (dayList?.length && rows.length) {
    const title = headRow + rows.length + 4
    ws.mergeCells(title, 1, title, Math.min(span, 6))
    const g = ws.getCell(title, 1)
    g.value = "Day by day"
    g.font = { name: FONT, size: 13, bold: true, color: { argb: INK } }
    g.alignment = { vertical: "middle" }
    ws.getRow(title).height = 26

    const gridHead = title + 1
    const nameCell = ws.getCell(gridHead, 1)
    nameCell.value = "Person"
    nameCell.font = { name: FONT, size: 9, bold: true, color: { argb: MUTED } }
    nameCell.alignment = { vertical: "bottom", horizontal: "left" }
    nameCell.border = underline
    ws.getRow(gridHead).height = 20

    dayList.forEach((d, i) => {
      const col = i + 2
      const cell = ws.getCell(gridHead, col)
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay()
      const off = holidays?.has?.(d) || weeklyOff?.has?.(dow)
      cell.value = Number(d.slice(8, 10))
      // A day off is greyed in the header instead of shaded down the column:
      // the tint in each cell already says what the day was.
      cell.font = { name: FONT, size: 9, bold: !off, color: { argb: off ? MUTED : INK } }
      cell.alignment = { vertical: "bottom", horizontal: "center" }
      cell.border = underline
      const column = ws.getColumn(col)
      if (!column.width || column.width > 4) column.width = 4
    })

    const byCell = new Map()
    for (const d of days || []) byCell.set(`${d.user_id}|${d.day}`, d)

    rows.forEach((r, n) => {
      const rowIndex = gridHead + 1 + n
      ws.getRow(rowIndex).height = 20
      const who = ws.getCell(rowIndex, 1)
      who.value = r.name
      who.font = { name: FONT, size: 10, color: { argb: INK } }
      who.alignment = { vertical: "middle", horizontal: "left" }
      who.border = { bottom: hair }
      dayList.forEach((d, i) => {
        const e = byCell.get(`${r.user_id}|${d}`)
        const status = e ? e.override_status || e.status : ""
        const cell = ws.getCell(rowIndex, i + 2)
        cell.value = status
        // No colour is painted on the cell: the conditional formatting below
        // colours it from its VALUE, so correcting a letter in Excel recolours
        // the square instead of leaving a green cell reading A.
        cell.font = { name: FONT, size: 9, bold: true, color: { argb: MUTED } }
        cell.alignment = { vertical: "middle", horizontal: "center" }
        cell.border = { bottom: hair }
        if (e?.late) cell.note = `Late by ${e.late_min} min`
      })
    })

    const firstCol = ws.getColumn(2).letter
    const lastCol = ws.getColumn(dayList.length + 1).letter
    const range = `${firstCol}${gridHead + 1}:${lastCol}${gridHead + rows.length}`
    ws.addConditionalFormatting({
      ref: range,
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
  }
}

function legendSheet(wb, withOvertime) {
  const ws = wb.addWorksheet("Legend", { views: [{ showGridLines: false }] })
  ws.getColumn(1).width = 8
  ws.getColumn(2).width = 24
  ws.getColumn(3).width = 78
  ws.properties.defaultRowHeight = 20

  ws.getCell(2, 1).value = "What the letters mean"
  ws.getCell(2, 1).font = { name: FONT, size: 18, bold: true, color: { argb: INK } }
  ws.getRow(2).height = 28

  const notes = {
    P: "A full day worked.",
    HD: "Worked, but under the half-day threshold in Attendance settings.",
    A: "No attendance, or a check-in that was never closed before midnight.",
    OD: "Every punch that day was made in the field, away from a station.",
    WO: "Weekly off.",
    H: "A company holiday.",
    MP: "A punch is missing and the day is waiting for a correction.",
    L: "Approved leave.",
    LOP: "Leave without pay.",
  }

  let row = 4
  for (const [code, label] of Object.entries(STATUS_LABEL)) {
    ws.getRow(row).height = 22
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

  row += 2
  const lines = [
    "Hours are the minutes worked, rounded to one decimal.",
    "A check-in before the shift starts counts from the shift start, so an early arrival does not bank time.",
    "Payable days = P + OD + WO + H + L, half of each HD and MP, less the late penalty.",
    withOvertime
      ? "Overtime is the time past the shift on a working day, and every worked minute on a holiday or a weekly off."
      : "Overtime is recorded, and appears only in a file exported by an admin.",
  ]
  for (const line of lines) {
    const cell = ws.getCell(row, 1)
    ws.mergeCells(row, 1, row, 3)
    cell.value = line
    cell.font = { name: FONT, size: 10, color: { argb: MUTED } }
    cell.alignment = { vertical: "middle", horizontal: "left" }
    row += 1
  }
}
