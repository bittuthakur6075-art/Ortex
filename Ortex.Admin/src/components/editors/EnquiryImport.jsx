import { useState, useMemo } from "react"
import { toast } from "sonner"
import { Upload } from "../ui/Icons"
import { Modal, Button, Select, Field, Banner, StatusBadge } from "../ui/Ui"
import { repo } from "../../data/store/repository"
import { ENQUIRY_STATUS, LEAD_SOURCES } from "../../data/domain/schema"
import { sheetToEnquiries } from "../../lib/enquiryImport"
import { formatDate, formatNumber } from "../../lib/format"

// Enquiries -> Import: the sales team's call-log workbook (Date, Name, Mobile
// No., Status, Mobile No.2, Type of Product, Quantity, Rate, City, company
// Name, Email id) filed as enquiries. The phone has the same import
// (Ortex.Mobile/src/features/leads/EnquiryImportSheet.tsx). Rows already in
// the console are skipped, so the same file can be imported again safely.

const CHUNK = 200

export default function EnquiryImport({ open, onClose, existing }) {
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState(null)
  const [source, setSource] = useState("Phone")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)

  const result = useMemo(() => (rows ? sheetToEnquiries(rows, { source, fileName, existing }) : null), [rows, source, fileName, existing])

  const reset = () => {
    setFileName("")
    setRows(null)
    setDone(0)
  }
  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  const readFile = async (file) => {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) return toast.error("That file is over 20 MB.")
    setBusy(true)
    try {
      // SheetJS loads only when someone imports (same as the product import).
      const XLSX = await import("xlsx")
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      setRows(XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }))
      setFileName(file.name)
    } catch (e) {
      toast.error(`Could not read the file: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const importAll = async () => {
    const list = result?.enquiries || []
    if (!list.length) return
    setBusy(true)
    let saved = 0
    setDone(0)
    try {
      for (let i = 0; i < list.length; i += CHUNK) {
        await repo.bulkCreate("enquiries", list.slice(i, i + CHUNK))
        saved = Math.min(list.length, i + CHUNK)
        setDone(saved)
      }
      toast.success(`${formatNumber(list.length)} enquiries imported`)
      setBusy(false)
      close()
    } catch (e) {
      toast.error(`Import stopped after ${formatNumber(saved)}: ${e.message}. Import the file again to add the rest; rows already in are skipped.`)
      setBusy(false)
    }
  }

  const list = result?.enquiries || []
  const counts = ENQUIRY_STATUS.map((s) => [s, list.filter((e) => e.status === s.id).length]).filter(([, n]) => n)
  const dates = list.map((e) => e.createdAt).filter(Boolean).sort()

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import enquiries from Excel"
      width="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={rows ? reset : close} disabled={busy}>
            {rows ? "Choose another file" : "Cancel"}
          </Button>
          <Button onClick={importAll} disabled={busy || !list.length}>
            {busy && done ? `Importing ${formatNumber(done)} of ${formatNumber(list.length)}…` : `Import ${formatNumber(list.length)} enquiries`}
          </Button>
        </>
      }
    >
      {!rows ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The first sheet is read. It needs a header row with at least <b>Name</b> and <b>Mobile No.</b>; Date, Status, Mobile No.2, Type of Product, Quantity, Rate, City, company Name and Email id are used
            when present. A date written once applies to the rows under it.
          </p>
          <label className="squircle flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed border-border px-5 py-10 text-center hover:bg-subtle">
            <Upload className="h-7 w-7 text-primary" />
            <span className="text-sm font-semibold text-foreground">{busy ? "Reading…" : "Choose an Excel or CSV file"}</span>
            <span className="text-xs text-muted-foreground">.xlsx, .xls or .csv, up to 20 MB</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={busy} onChange={(e) => readFile(e.target.files?.[0])} />
          </label>
        </div>
      ) : result.error ? (
        <Banner tone="danger">{result.error}</Banner>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Ready to import" value={formatNumber(list.length)} />
            <Stat label="Skipped" value={formatNumber(result.skipped.length)} />
            <Stat label="Dates" value={dates.length ? `${formatDate(dates[0])} to ${formatDate(dates.at(-1))}` : "Today"} />
          </div>

          {counts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {counts.map(([s, n]) => (
                <span key={s.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusBadge list={ENQUIRY_STATUS} status={s.id} /> {formatNumber(n)}
                </span>
              ))}
            </div>
          )}

          <Field label="Source" hint="Where these enquiries came from">
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-[13px]">
              <thead className="mt-head">
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="mt-body">
                {list.slice(0, 6).map((e) => (
                  <tr key={e.imported.row}>
                    <td className="whitespace-nowrap">{e.createdAt ? formatDate(e.createdAt) : "Today"}</td>
                    <td>{e.customer.name}</td>
                    <td className="tabular">{e.customer.phone}</td>
                    <td>{e.productInterest}</td>
                    <td className="tabular">{e.quantity}</td>
                    <td>
                      <StatusBadge list={ENQUIRY_STATUS} status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Status is matched from the Status and Mobile No.2 words (price given is Quoted, waiting for order is Qualified, order received is Won); the original words stay in each enquiry's notes. Each person is
            also added to Customers, matched by email and phone. Imported enquiries do not send alerts.
          </p>

          {result.skipped.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">Why {formatNumber(result.skipped.length)} rows were skipped</summary>
              <ul className="mt-1.5 space-y-0.5">
                {result.skipped.slice(0, 50).map((s) => (
                  <li key={s.row}>
                    Row {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  )
}

function Stat({ label, value }) {
  return (
    <div className="squircle rounded-xl bg-subtle px-3.5 py-3">
      <div className="text-[15px] font-semibold text-foreground tabular">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
