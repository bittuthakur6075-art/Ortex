import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { ImportFile, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, X, Search } from "../ui/Icons"
import { repo } from "../../data/store/repository"
import { ENQUIRY_STATUS, LEAD_SOURCES } from "../../data/domain/schema"
import { sheetToEnquiries } from "../../lib/enquiryImport"
import { formatDate, formatNumber } from "../../lib/format"
import { cn } from "../../lib/cn"
import { Dot } from "../../pages/dashboard/parts"

// Leads -> Import: the sales team's call-log workbook (Date, Name, Mobile No.,
// Status, Mobile No.2, Type of Product, Quantity, Rate, City, company Name,
// Email id) filed as enquiries by lib/enquiryImport.js (tested, mirrored by the
// phone's EnquiryImportSheet). Three steps: pick a file (or drop it), review
// what was read (columns found, rows skipped and why, untick any row, set the
// source, an owner and a tag for the batch), then import with progress. Rows
// already in the console or repeated in the file are skipped, so the same file
// can be imported again; a row whose mobile is already a lead (another product
// or day) starts unticked and is flagged, for the person to decide.

const CHUNK = 200
const STATUS_TONE = { new: "blue", contacted: "amber", qualified: "violet", quoted: "blue", won: "emerald", lost: "rose" }
const FIELDS = [
  ["name", "Name", true],
  ["phone", "Mobile No.", true],
  ["date", "Date"],
  ["status", "Status"],
  ["phone2", "Mobile No.2"],
  ["product", "Type of Product"],
  ["quantity", "Quantity"],
  ["rate", "Rate"],
  ["city", "City"],
  ["company", "Company Name"],
  ["email", "Email id"],
]

export default function EnquiryImport({ open, onClose, existing, staff = [], me = "" }) {
  const [step, setStep] = useState("pick") // pick | review | importing | done
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState(null)
  const [source, setSource] = useState("Phone")
  const [owner, setOwner] = useState("")
  const [tag, setTag] = useState("")
  const [off, setOff] = useState(() => new Set()) // sheet row numbers left out
  const [query, setQuery] = useState("")
  const [reading, setReading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [done, setDone] = useState(0)
  const [imported, setImported] = useState(0)

  const result = useMemo(() => (rows ? sheetToEnquiries(rows, { source, fileName, existing }) : null), [rows, source, fileName, existing])
  const all = result?.enquiries || []
  const chosen = all.filter((e) => !off.has(e.imported.row))
  const header = result?.headerRow >= 0 ? rows[result.headerRow] : []
  const repeatOf = new Map((result?.repeats || []).map((r) => [r.row, r.name]))

  // A new file starts with its possible duplicates unticked.
  useEffect(() => {
    setOff(new Set((result?.repeats || []).map((r) => r.row)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const reset = () => {
    setStep("pick")
    setFileName("")
    setRows(null)
    setOff(new Set())
    setQuery("")
    setDone(0)
  }

  useEffect(() => {
    if (open) {
      reset()
      setOwner("")
      setTag("")
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === "Escape" && step !== "importing" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, step, onClose])

  const readFile = async (file) => {
    if (!file) return
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return toast.error("Choose an .xlsx, .xls or .csv file.")
    if (file.size > 20 * 1024 * 1024) return toast.error("That file is over 20 MB.")
    setReading(true)
    try {
      // SheetJS loads only when someone imports (same as the product import).
      const XLSX = await import("xlsx")
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      setRows(XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }))
      setFileName(file.name)
      setOff(new Set())
      setStep("review")
    } catch (e) {
      toast.error(`Could not read the file: ${e.message}`)
    } finally {
      setReading(false)
    }
  }

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx")
    const ws = XLSX.utils.aoa_to_sheet([
      FIELDS.map(([, label]) => label),
      ["27/09/2026", "Priya Nair", "9845022117", "Price given", "", "Lanyards", "1000", "24", "Bengaluru", "Infosys Ltd", "priya@example.com"],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Leads")
    XLSX.writeFile(wb, "Ortex-leads-import-template.xlsx")
  }

  const importAll = async () => {
    if (!chosen.length) return
    const extra = { ...(owner ? { owner } : {}), ...(tag.trim() ? { tags: [tag.trim()] } : {}) }
    const list = chosen.map((e) => ({ ...e, ...extra }))
    setStep("importing")
    setDone(0)
    let saved = 0
    try {
      for (let i = 0; i < list.length; i += CHUNK) {
        await repo.bulkCreate("enquiries", list.slice(i, i + CHUNK))
        saved = Math.min(list.length, i + CHUNK)
        setDone(saved)
      }
      setImported(list.length)
      setStep("done")
    } catch (e) {
      toast.error(`Import stopped after ${formatNumber(saved)}: ${e.message}. Import the file again to add the rest; rows already in are skipped.`)
      setStep("review")
    }
  }

  if (!open) return null

  const byReason = (result?.skipped || []).reduce((m, s) => ((m[s.reason] = (m[s.reason] || 0) + 1), m), {})
  const dates = chosen.map((e) => e.createdAt).filter(Boolean).sort()
  const counts = ENQUIRY_STATUS.map((s) => [s, chosen.filter((e) => e.status === s.id).length]).filter(([, n]) => n)
  const q = query.trim().toLowerCase()
  const visible = q ? all.filter((e) => [e.customer.name, e.customer.phone, e.productInterest, e.customer.company, e.customer.city].some((v) => String(v || "").toLowerCase().includes(q))) : all
  const allOn = visible.length > 0 && visible.every((e) => !off.has(e.imported.row))
  const toggleRow = (row) =>
    setOff((s) => {
      const n = new Set(s)
      if (n.has(row)) n.delete(row)
      else n.add(row)
      return n
    })

  const stepIndex = { pick: 0, review: 1, importing: 2, done: 2 }[step]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Import leads">
      <div className="absolute inset-0 bg-foreground/40 animate-fade-in" onClick={() => step !== "importing" && onClose()} />
      <div className="squircle relative flex max-h-[calc(100dvh-32px)] w-full max-w-[880px] flex-col overflow-hidden rounded-card bg-card shadow-overlay-lg animate-pop-in">
        {/* Header with steps */}
        <div className="flex flex-none items-center gap-4 border-b border-border px-6 py-4">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-primary/10 text-primary">
            <ImportFile className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold text-foreground">Import leads from Excel</h2>
            <ol className="mt-1 flex items-center gap-2 text-xs">
              {["Choose file", "Review", "Import"].map((label, i) => (
                <li key={label} className="flex items-center gap-2">
                  {i > 0 && <span className="h-px w-5 bg-line" />}
                  <span className={cn("flex items-center gap-1.5", i === stepIndex ? "font-semibold text-primary" : i < stepIndex ? "text-foreground" : "text-muted-foreground")}>
                    <span className={cn("grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold", i < stepIndex || step === "done" ? "bg-primary text-primary-foreground" : i === stepIndex ? "ring-2 ring-primary" : "ring-1 ring-line")}>
                      {i < stepIndex || step === "done" ? "✓" : i + 1}
                    </span>
                    {label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          {step !== "importing" && (
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 flex-none place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <X variant="Linear" className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === "pick" && (
            <div className="space-y-5">
              <label
                onDragOver={(e) => {
                  e.preventDefault()
                  setDrag(true)
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDrag(false)
                  readFile(e.dataTransfer.files?.[0])
                }}
                className={cn(
                  "squircle flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
                  drag ? "border-primary bg-primary/[0.05]" : "border-line hover:border-primary/50 hover:bg-muted",
                )}
              >
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <FileSpreadsheet className="h-7 w-7" />
                </span>
                <span className="text-[15px] font-semibold text-foreground">{reading ? "Reading the file…" : drag ? "Drop it here" : "Drop your Excel file here, or click to choose"}</span>
                <span className="text-xs text-muted-foreground">.xlsx, .xls or .csv · up to 20 MB · the first sheet is read</span>
                <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={reading} onChange={(e) => readFile(e.target.files?.[0])} />
              </label>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-foreground">Columns it reads</p>
                  <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline">
                    <Download className="h-4 w-4" /> Download template
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FIELDS.map(([key, label, req]) => (
                    <span key={key} className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium", req ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                      {label}
                      {req && " *"}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Name and Mobile No. are required (*). A date written once applies to the rows under it. Status words are matched: price given is Quoted, waiting for order is Qualified, order received is Won. The original words stay in each lead&apos;s notes.
                </p>
              </div>
            </div>
          )}

          {step === "review" && result?.error && (
            <div className="space-y-4">
              <div className="squircle flex gap-3 rounded-xl bg-destructive/[0.07] px-4 py-3 text-[13px] text-destructive-text">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <div>
                  <b className="block">This file could not be read as a leads sheet</b>
                  {result.error} Check the column names, or start from the template.
                </div>
              </div>
              <FileCard name={fileName} rows={rows.length} onChange={reset} />
            </div>
          )}

          {step === "review" && result && !result.error && (
            <div className="space-y-5">
              <FileCard name={fileName} rows={rows.length - 1 - result.headerRow} onChange={reset} />

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                <Stat label="Will be imported" value={formatNumber(chosen.length)} tone="blue" />
                <Stat label="Duplicates left out" value={formatNumber((byReason["Already in the console"] || 0) + (byReason["Repeated in this file"] || 0))} />
                <Stat label="Mobile already a lead" value={formatNumber(repeatOf.size)} tone={repeatOf.size ? "amber" : undefined} />
                <Stat label="Missing name and mobile" value={formatNumber(byReason["No name or mobile"] || 0)} tone={byReason["No name or mobile"] ? "amber" : undefined} />
                <Stat label="Dates" value={!dates.length ? "Today" : dates[0].slice(0, 10) === dates.at(-1).slice(0, 10) ? formatDate(dates[0]) : `${formatDate(dates[0]).slice(0, 6)} to ${formatDate(dates.at(-1)).slice(0, 6)}`} small />
              </div>

              {repeatOf.size > 0 && (
                <div className="squircle flex items-start gap-3 rounded-xl bg-warning/12 px-4 py-3 text-[13px] text-warning-text">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                  <div className="min-w-0 flex-1">
                    <b className="block">
                      {formatNumber(repeatOf.size)} {repeatOf.size === 1 ? "mobile is" : "mobiles are"} already a lead
                    </b>
                    Asked about another product or on another day. {repeatOf.size === 1 ? "It is" : "They are"} unticked below; tick a row to add it as a new enquiry.
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setOff((s) => {
                        const n = new Set(s)
                        const allOff = [...repeatOf.keys()].every((r) => n.has(r))
                        for (const r of repeatOf.keys()) n[allOff ? "delete" : "add"](r)
                        return n
                      })
                    }
                    className="flex-none font-semibold hover:underline"
                  >
                    {[...repeatOf.keys()].every((r) => off.has(r)) ? "Tick them all" : "Untick them all"}
                  </button>
                </div>
              )}

              {/* Columns found */}
              <div>
                <p className="mb-2 text-[13px] font-semibold text-foreground">Columns found</p>
                <div className="flex flex-wrap gap-1.5">
                  {FIELDS.map(([key, label]) => {
                    const col = result.columns?.[key]
                    const found = col !== undefined
                    return (
                      <span key={key} title={found ? `Read from "${String(header[col] || `column ${col + 1}`)}"` : "Not in this sheet"} className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium", found ? "bg-success/12 text-success-text" : "bg-muted text-subtle-foreground line-through")}>
                        {found && <CheckCircle2 className="h-3 w-3" />}
                        {label}
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Batch settings */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Pick label="Source" value={source} onChange={setSource} options={LEAD_SOURCES.map((s) => [s, s])} />
                <Pick label="Assign to" value={owner} onChange={setOwner} options={[["", "No one yet"], ...(me ? [[me, `Me (${me})`]] : []), ...staff.filter((n) => n !== me).map((n) => [n, n])]} />
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Tag every lead (optional)</span>
                  <input value={tag} maxLength={24} onChange={(e) => setTag(e.target.value)} placeholder="e.g. Expo Sep 2026" className="squircle h-10 w-full rounded-[10px] border border-line bg-card px-3 text-[13px] text-foreground outline-none placeholder:text-subtle-foreground focus:border-primary" />
                </label>
              </div>

              {counts.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Status read from the sheet:</span>
                  {counts.map(([s, n]) => (
                    <span key={s.id} className="inline-flex items-center gap-1.5">
                      <Dot tone={STATUS_TONE[s.id]} size={7} /> {s.label} {formatNumber(n)}
                    </span>
                  ))}
                </div>
              )}

              {/* Rows */}
              <div className="squircle overflow-hidden rounded-xl border border-line">
                <div className="flex items-center gap-3 border-b border-border px-3 py-2">
                  <Search className="h-4 w-4 text-subtle-foreground" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a row" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {formatNumber(chosen.length)} of {formatNumber(all.length)} ticked
                  </span>
                </div>
                <div className="max-h-[300px] overflow-auto">
                  <table className="w-full text-left">
                    <thead className="v2-head sticky top-0 z-10">
                      <tr>
                        <th style={{ width: 36 }}>
                          <input
                            type="checkbox"
                            aria-label="Tick every row"
                            checked={allOn}
                            onChange={() =>
                              setOff((s) => {
                                const n = new Set(s)
                                for (const e of visible) {
                                  if (allOn) n.add(e.imported.row)
                                  else n.delete(e.imported.row)
                                }
                                return n
                              })
                            }
                          />
                        </th>
                        <th>Row</th>
                        <th>Date</th>
                        <th>Name</th>
                        <th>Mobile</th>
                        <th>Product · Qty</th>
                        <th>City</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody className="v2-body [&_td]:!h-10">
                      {visible.slice(0, 300).map((e) => {
                        const on = !off.has(e.imported.row)
                        return (
                          <tr key={e.imported.row} className={cn("v2-row", !on && "opacity-45")} onClick={() => toggleRow(e.imported.row)}>
                            <td onClick={(ev) => ev.stopPropagation()}>
                              <input type="checkbox" checked={on} onChange={() => toggleRow(e.imported.row)} aria-label={`Import row ${e.imported.row}`} />
                            </td>
                            <td className="text-xs text-muted-foreground tabular">{e.imported.row}</td>
                            <td className="whitespace-nowrap text-xs">{e.createdAt ? formatDate(e.createdAt) : "Today"}</td>
                            <td className="max-w-[160px] truncate font-medium">{e.customer.name}</td>
                            <td className="whitespace-nowrap tabular">
                              {e.customer.phone || "—"}
                              {repeatOf.has(e.imported.row) && (
                                <span title={`Already a lead: ${repeatOf.get(e.imported.row)}`} className="ml-1.5 inline-flex h-[17px] items-center rounded-full bg-warning/12 px-2 text-[11px] font-medium text-warning-text">
                                  Already a lead
                                </span>
                              )}
                            </td>
                            <td className="max-w-[200px] truncate">
                              {e.productInterest || "—"}
                              {e.quantity && <span className="text-muted-foreground"> · {e.quantity}</span>}
                            </td>
                            <td className="max-w-[120px] truncate text-muted-foreground">{e.customer.city || "—"}</td>
                            <td>
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
                                <Dot tone={STATUS_TONE[e.status]} size={7} /> {ENQUIRY_STATUS.find((s) => s.id === e.status)?.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {visible.length > 300 && <p className="px-3 py-2 text-xs text-muted-foreground">Showing the first 300 of {formatNumber(visible.length)}. Every ticked row is imported.</p>}
                  {!visible.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">No rows match.</p>}
                </div>
              </div>

              {result.skipped.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-foreground">Why {formatNumber(result.skipped.length)} {result.skipped.length === 1 ? "row is" : "rows are"} left out</summary>
                  <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto">
                    {result.skipped.slice(0, 200).map((s) => (
                      <li key={s.row}>
                        Row {s.row}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center py-12 text-center">
              <p className="text-[15px] font-semibold text-foreground">
                Importing {formatNumber(done)} of {formatNumber(chosen.length)}…
              </p>
              <div className="mt-4 h-2 w-full max-w-md overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${chosen.length ? (done / chosen.length) * 100 : 0}%` }} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Keep this window open. Each person is also added to Customers.</p>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center py-12 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-success/12 text-success-text">
                <CheckCircle2 variant="Bold" className="h-8 w-8" />
              </span>
              <p className="mt-4 text-lg font-semibold text-foreground">{formatNumber(imported)} leads imported</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                From {fileName}
                {owner ? `, assigned to ${owner}` : ""}
                {tag.trim() ? `, tagged "${tag.trim()}"` : ""}. Imported leads send no alerts.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-none items-center justify-between gap-3 border-t border-border bg-muted px-6 py-3.5">
          <span className="text-xs text-muted-foreground">{step === "review" && !result?.error ? `${formatNumber(chosen.length)} leads will be added` : ""}</span>
          <div className="flex items-center gap-2">
            {step === "pick" && <FootBtn onClick={onClose}>Cancel</FootBtn>}
            {step === "review" && (
              <>
                <FootBtn onClick={reset}>Back</FootBtn>
                <FootBtn primary onClick={importAll} disabled={!chosen.length || !!result?.error}>
                  Import {formatNumber(chosen.length)} lead{chosen.length === 1 ? "" : "s"}
                </FootBtn>
              </>
            )}
            {step === "done" && (
              <>
                <FootBtn onClick={reset}>Import another file</FootBtn>
                <FootBtn primary onClick={onClose}>
                  View leads
                </FootBtn>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function FileCard({ name, rows, onChange }) {
  return (
    <div className="squircle flex items-center gap-3 rounded-xl border border-line px-3.5 py-3">
      <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-success/12 text-success-text">
        <FileSpreadsheet className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-foreground">{name}</div>
        <div className="text-xs text-muted-foreground">{formatNumber(Math.max(0, rows))} rows under the header</div>
      </div>
      <button type="button" onClick={onChange} className="flex-none text-[13px] font-medium text-primary hover:underline">
        Change file
      </button>
    </div>
  )
}

function Stat({ label, value, tone, small }) {
  return (
    <div className="squircle rounded-xl bg-muted px-3.5 py-3">
      <div className={cn("font-semibold tabular", small ? "text-[14px] leading-6" : "text-xl leading-6", tone === "blue" ? "text-primary" : tone === "amber" ? "text-warning-text" : "text-foreground")}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function Pick({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="squircle h-10 w-full cursor-pointer rounded-[10px] border border-line bg-card px-3 text-[13px] text-foreground outline-none focus:border-primary">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  )
}

function FootBtn({ primary, children, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "squircle h-10 rounded-xl px-4 text-[13px] font-semibold transition-colors disabled:opacity-50",
        primary ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border border-line bg-card text-foreground hover:bg-background",
      )}
      {...props}
    >
      {children}
    </button>
  )
}
