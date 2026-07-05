import { useState } from "react"
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "./icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { newProduct, GST_RATES, UNITS } from "../data/schema"
import { downloadCsvRaw, parseCsv } from "../lib/csv"
import { round2 } from "../lib/format"
import { Button, Modal, Badge } from "./ui"

// Import column order = template order. Header names are matched case-insensitively.
const COLUMNS = ["name", "sku", "category", "hsn", "unit", "basePrice", "costPrice", "moq", "gstRate", "leadTimeDays", "status", "material", "description"]

const SAMPLE = [
  ["Custom MDF Keychain", "MDF-KEY-01", "MDF products", "4420", "pcs", "45", "18", "100", "18", "7", "active", "3mm MDF", "Laser-cut MDF keychain"],
  ["Acrylic Fridge Magnet", "ACR-MAG-01", "Acrylic products", "3926", "pcs", "35", "14", "100", "18", "6", "active", "3mm acrylic", "UV-printed magnet"],
]

function validateRow(raw) {
  // Map headers case-insensitively to our known columns.
  const get = (key) => {
    const found = Object.keys(raw).find((k) => k.trim().toLowerCase() === key.toLowerCase())
    return found ? raw[found] : ""
  }
  const name = get("name").trim()
  const errors = []
  if (!name) errors.push("Name is required")

  const basePrice = Number(get("basePrice"))
  if (get("basePrice") !== "" && Number.isNaN(basePrice)) errors.push("Base price is not a number")

  let gstRate = Number(get("gstRate"))
  if (!GST_RATES.includes(gstRate)) gstRate = 18

  let unit = get("unit").trim().toLowerCase()
  if (!UNITS.includes(unit)) unit = "pcs"

  let status = get("status").trim().toLowerCase()
  if (!["active", "draft", "archived"].includes(status)) status = "active"

  const product = newProduct({
    name,
    sku: get("sku").trim(),
    category: get("category").trim() || "MDF products",
    hsn: get("hsn").trim(),
    unit,
    basePrice: round2(basePrice || 0),
    costPrice: round2(Number(get("costPrice")) || 0),
    moq: Math.max(1, parseInt(get("moq")) || 1),
    gstRate,
    leadTimeDays: parseInt(get("leadTimeDays")) || 7,
    status,
    material: get("material").trim(),
    description: get("description").trim(),
  })
  return { product, errors, valid: errors.length === 0, name: name || "(no name)" }
}

export default function ProductImport({ open, onClose }) {
  const [rows, setRows] = useState(null) // parsed+validated
  const [fileName, setFileName] = useState("")

  const downloadTemplate = () => {
    downloadCsvRaw("ortex-products-template.csv", [COLUMNS, ...SAMPLE])
    toast.success("Template downloaded — open in Excel, fill rows, then upload")
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const text = await file.text()
    const { rows: parsed } = parseCsv(text)
    if (!parsed.length) {
      toast.error("No rows found in the file")
      setRows([])
      return
    }
    setRows(parsed.map(validateRow))
    e.target.value = "" // allow re-upload of same file
  }

  const validRows = rows?.filter((r) => r.valid) || []
  const invalidCount = (rows?.length || 0) - validRows.length

  const commit = async () => {
    if (!validRows.length) return
    await repo.bulkCreate("products", validRows.map((r) => r.product))
    toast.success(`Imported ${validRows.length} product${validRows.length > 1 ? "s" : ""}`)
    reset()
    onClose()
  }

  const reset = () => {
    setRows(null)
    setFileName("")
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Bulk import products"
      width="max-w-3xl"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {rows ? `${validRows.length} ready${invalidCount ? ` · ${invalidCount} skipped` : ""}` : "Step 1 → download · Step 2 → fill · Step 3 → upload"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reset} disabled={!rows}>
              Clear
            </Button>
            <Button size="sm" onClick={commit} disabled={!validRows.length}>
              <CheckCircle2 className="h-4 w-4" /> Import {validRows.length || ""}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Steps */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button onClick={downloadTemplate} className="flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted/40">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Download className="h-4.5 w-4.5" />
            </span>
            <span className="font-semibold text-foreground">1. Download template</span>
            <span className="text-xs text-muted-foreground">Excel/CSV with the right columns + sample rows.</span>
          </button>
          <div className="flex flex-col items-start gap-2 rounded-xl border border-border p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FileSpreadsheet className="h-4.5 w-4.5" />
            </span>
            <span className="font-semibold text-foreground">2. Fill it in</span>
            <span className="text-xs text-muted-foreground">One product per row. Keep the header row.</span>
          </div>
          <label className="flex cursor-pointer flex-col items-start gap-2 rounded-xl border border-border p-4 transition-colors hover:bg-muted/40">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Upload className="h-4.5 w-4.5" />
            </span>
            <span className="font-semibold text-foreground">3. Upload</span>
            <span className="text-xs text-muted-foreground">{fileName || "Choose your filled .csv file"}</span>
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
        </div>

        {/* Preview */}
        {rows && (
          <div>
            <div className="mb-2 flex items-center gap-3 text-sm">
              <span className="font-semibold text-foreground">Preview</span>
              <Badge tone="emerald">{validRows.length} ready</Badge>
              {invalidCount > 0 && <Badge tone="rose">{invalidCount} with errors</Badge>}
            </div>
            <div className="max-h-72 overflow-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                    <th className="px-3 py-2 text-right font-medium">GST</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, i) => (
                    <tr key={i} className={r.valid ? "" : "bg-destructive/5"}>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.valid ? <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" /> : <AlertTriangle className="h-4 w-4 text-destructive" title={r.errors.join(", ")} />}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{r.product.name}</div>
                        {!r.valid && <div className="text-xs text-destructive">{r.errors.join(", ")}</div>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.product.category}</td>
                      <td className="px-3 py-2 text-right tabular text-muted-foreground">₹{r.product.basePrice}</td>
                      <td className="px-3 py-2 text-right tabular text-muted-foreground">{r.product.gstRate}%</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.product.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
