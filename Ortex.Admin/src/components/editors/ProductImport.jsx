import { useState } from "react"
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Sparkles, ImageIcon } from "../ui/Icons"
import { toast } from "sonner"
import { repo } from "../../data/store/repository"
import { newProduct, GST_RATES, UNITS, autoDetectCategory } from "../../data/domain/schema"
import { useCategories } from "../../hooks/useCollection"
import { downloadCsvRaw, parseCsv } from "../../lib/csv"
import { extractSheetImages, sheetRowForDataIndex } from "../../lib/xlsxImages"
import { uploadImage } from "../../lib/imageUpload"
import { round2 } from "../../lib/format"
import { Button, Modal, Badge } from "../ui/Ui"

// Import column order = template order. Header names are matched
// case-insensitively, so a sheet written by hand (or by an AI asked to follow
// the template) still lines up if the casing drifts.
const COLUMNS = [
  "name", "sku", "category", "hsn", "unit", "basePrice", "costPrice",
  "moq", "gstRate", "leadTimeDays", "status", "material", "description", "imageUrls",
]

const SAMPLE = [
  ["Custom MDF Keychain", "MDF-KEY-01", "MDF products", "4420", "pcs", "45", "18", "100", "18", "7", "active", "3mm MDF", "Laser-cut MDF keychain", "https://example.com/keychain-1.jpg, https://example.com/keychain-2.jpg"],
  ["Acrylic Fridge Magnet", "ACR-MAG-01", "Acrylic products", "3926", "pcs", "35", "14", "100", "18", "6", "active", "3mm acrylic", "UV-printed magnet", ""],
]

// Second sheet of the workbook. Whoever fills the file — a colleague or a
// chatbot — needs the rules next to the data, not in a separate email.
const GUIDE = [
  ["Column", "Required", "What to put"],
  ["name", "Yes", "Product name as it should appear on quotations and the website."],
  ["sku", "No", "Your internal code. Leave blank if you don't use one."],
  ["category", "No", "Must match a category name in the console. Left blank, it is guessed from the name."],
  ["hsn", "No", "HSN code for GST. Left blank, the category's default is used."],
  ["unit", "No", `One of: ${UNITS.join(", ")}. Defaults to pcs.`],
  ["basePrice", "No", "Selling price per unit, digits only (no ₹ sign, no commas)."],
  ["costPrice", "No", "What it costs you per unit. Drives the margin column."],
  ["moq", "No", "Minimum order quantity, whole number. Defaults to 1."],
  ["gstRate", "No", `One of: ${GST_RATES.join(", ")}. Defaults to the category rate, else 18.`],
  ["leadTimeDays", "No", "Production days. Defaults to 7."],
  ["status", "No", "active, draft or archived. Defaults to active."],
  ["material", "No", "Short spec, e.g. '3mm MDF' or '180gsm polyester'."],
  ["description", "No", "A sentence or two for the website and quotations."],
  ["imageUrls", "No", "Public https image links, separated by commas. Stored as links, not copied."],
  [],
  ["Photos", "", ""],
  ["", "", "Two ways to add photos, and you can mix them."],
  ["", "", "1. Paste pictures straight into this sheet (Insert > Pictures), one or more per product."],
  ["", "", "   Drop each picture so its TOP-LEFT corner sits on that product's row. That row decides"],
  ["", "", "   which product it belongs to — the column does not matter."],
  ["", "", "   They are uploaded into Ortex on import, so they keep working forever."],
  ["", "", "2. Put public https links in the imageUrls column. Faster, but the photos stay on that host."],
  ["", "", "Pictures inserted with Excel 365's 'Place in Cell' are not read — use Insert > Pictures instead."],
  [],
  ["Rules", "", ""],
  ["", "", "One product per row. Keep the header row exactly as it is."],
  ["", "", "Do not add, rename or reorder columns — extra columns are ignored."],
  ["", "", "Prices and quantities must be plain numbers."],
]

// Signage only — never part of the data contract, so it stays out of COLUMNS,
// the CSV template and the AI prompt.
const PHOTO_COLUMN = "photo — paste pictures on this row"

// A prompt the user can paste into ChatGPT (or any other model) so it returns a
// sheet in exactly this shape. This is the whole point of the Excel route: the
// research and the copywriting happen wherever the user likes, and the console
// only has to accept the result.
const AI_PROMPT = `You are helping me bulk-load products into my catalogue.

Produce a table with EXACTLY these columns, in this order, with this header row:
${COLUMNS.join(" | ")}

Rules:
- One product per row. Do not add, rename or reorder columns.
- name is required. Everything else may be left blank.
- unit: one of ${UNITS.join(", ")} (default pcs).
- gstRate: one of ${GST_RATES.join(", ")} (default 18).
- status: active, draft or archived (default active).
- basePrice, costPrice, moq, leadTimeDays: plain numbers only, no currency symbols, no commas, no ranges.
- description: one or two sentences, written for an Indian B2B buyer, no marketing hype.
- material: a short spec such as "3mm MDF" or "180gsm polyester".
- imageUrls: public https links separated by commas, or blank if you have none.

The products are: <describe your products here, e.g. "20 corporate gifting items in MDF and acrylic">.

Return it as a downloadable .xlsx file (or as CSV I can paste into Excel).`

function validateRow(raw, categories = [], embedded = []) {
  // Map headers case-insensitively to our known columns.
  const get = (key) => {
    const found = Object.keys(raw).find((k) => k.trim().toLowerCase() === key.toLowerCase())
    const v = found ? raw[found] : ""
    return v == null ? "" : String(v)
  }
  const name = get("name").trim()
  const errors = []
  if (!name) errors.push("Name is required")

  const basePrice = Number(get("basePrice"))
  if (get("basePrice") !== "" && Number.isNaN(basePrice)) errors.push("Base price is not a number")

  const categoryName = get("category").trim()
  let detectedCategory = null
  if (!categoryName && name) {
    detectedCategory = autoDetectCategory(name, categories)
  }

  const resolvedCategory = categoryName || (detectedCategory ? detectedCategory.name : "MDF products")
  const cat = categories.find((c) => c.name.toLowerCase() === resolvedCategory.toLowerCase())

  let hsn = get("hsn").trim()
  if (!hsn && cat) {
    hsn = cat.hsn || ""
  }

  let gstRate = get("gstRate") !== "" ? Number(get("gstRate")) : NaN
  if (Number.isNaN(gstRate)) {
    gstRate = cat && cat.gstRate != null ? cat.gstRate : 18
  } else if (!GST_RATES.includes(gstRate)) {
    gstRate = 18
  }

  let unit = get("unit").trim().toLowerCase()
  if (!UNITS.includes(unit)) unit = "pcs"

  let status = get("status").trim().toLowerCase()
  if (!["active", "draft", "archived"].includes(status)) status = "active"

  // Image links are stored as URLs, exactly as the website already does for
  // remotely-hosted photos. Anything that isn't an http(s) link is dropped
  // rather than saved and rendered as a broken image.
  const images = get("imageUrls")
    .split(/[,\n;]/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, 8)
  const droppedImages = get("imageUrls").trim() && images.length === 0

  const product = newProduct({
    name,
    sku: get("sku").trim(),
    category: resolvedCategory,
    hsn,
    unit,
    basePrice: round2(basePrice || 0),
    costPrice: round2(Number(get("costPrice")) || 0),
    moq: Math.max(1, parseInt(get("moq")) || 1),
    gstRate,
    leadTimeDays: parseInt(get("leadTimeDays")) || 7,
    status,
    material: get("material").trim(),
    description: get("description").trim(),
    images,
  })
  // Pictures pasted into the sheet are uploaded at import time, not now — a
  // preview the user may cancel should not leave files in the bucket.
  return { product, errors, valid: errors.length === 0, name: name || "(no name)", droppedImages, embedded }
}

export default function ProductImport({ open, onClose }) {
  const categories = useCategories()
  const [rows, setRows] = useState(null) // parsed+validated
  const [fileName, setFileName] = useState("")
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null) // { done, total } while uploading photos

  // SheetJS is ~400KB, and most sessions never open this dialog — load it only
  // when someone actually asks for a workbook.
  const downloadExcel = async () => {
    setBusy(true)
    try {
      const XLSX = await import("xlsx")
      const wb = XLSX.utils.book_new()
      // A trailing "photo" column that holds no data. Pasted pictures float
      // over the grid rather than living in a cell, so without a visibly
      // labelled place to drop them nobody can tell the feature exists. The
      // parser keys pictures by their row and ignores the column, and
      // validateRow only reads known headers — so this strip is pure signage.
      const header = [...COLUMNS, PHOTO_COLUMN]
      const sheet = XLSX.utils.aoa_to_sheet([header, ...SAMPLE])
      sheet["!cols"] = header.map((c) =>
        c === PHOTO_COLUMN ? { wch: 34 } : { wch: c === "description" || c === "imageUrls" ? 42 : Math.max(12, c.length + 4) },
      )
      // Tall rows so a dropped picture sits inside its own row rather than
      // straddling the next one — the row is what assigns it to a product.
      sheet["!rows"] = [{ hpt: 22 }, ...SAMPLE.map(() => ({ hpt: 90 }))]
      XLSX.utils.book_append_sheet(wb, sheet, "Products")
      const guide = XLSX.utils.aoa_to_sheet(GUIDE)
      guide["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 80 }]
      XLSX.utils.book_append_sheet(wb, guide, "How to fill")
      XLSX.writeFile(wb, "ortex-products-template.xlsx")
      toast.success("Excel template downloaded")
    } catch (err) {
      console.error("Template download failed:", err)
      toast.error("Could not build the Excel file")
    } finally {
      setBusy(false)
    }
  }

  const downloadTemplate = () => {
    downloadCsvRaw("ortex-products-template.csv", [COLUMNS, ...SAMPLE])
    toast.success("CSV template downloaded")
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT)
      toast.success("Prompt copied — paste it into ChatGPT, then upload what it returns")
    } catch {
      toast.error("Could not reach the clipboard")
    }
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-upload of the same file
    if (!file) return
    setFileName(file.name)
    setBusy(true)
    try {
      let parsed = []
      let imagesByRow = new Map()
      if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        const buffer = await file.arrayBuffer()
        const XLSX = await import("xlsx")
        const wb = XLSX.read(buffer, { type: "array" })
        // First sheet wins — the template's second sheet is only instructions.
        const ws = wb.Sheets[wb.SheetNames[0]]
        parsed = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false })
        // Pictures pasted into the sheet, keyed by the row they sit on.
        imagesByRow = extractSheetImages(buffer)
      } else {
        parsed = parseCsv(await file.text()).rows
      }
      if (!parsed.length) {
        toast.error("No rows found in that file")
        setRows([])
        return
      }
      setRows(parsed.map((row, i) => validateRow(row, categories, imagesByRow.get(sheetRowForDataIndex(i)) || [])))
    } catch (err) {
      console.error("Import parse failed:", err)
      toast.error("Could not read that file — is it a .xlsx or .csv?")
      setRows(null)
    } finally {
      setBusy(false)
    }
  }

  const validRows = rows?.filter((r) => r.valid) || []
  const invalidCount = (rows?.length || 0) - validRows.length
  const photoCount = (r) => (r.product.images?.length || 0) + r.embedded.length
  const withImages = validRows.filter((r) => photoCount(r) > 0).length
  const embeddedTotal = validRows.reduce((n, r) => n + r.embedded.length, 0)

  const commit = async () => {
    if (!validRows.length) return
    setBusy(true)
    try {
      // Upload the pasted pictures first, so a product is only created once its
      // photos have a home. A failed upload costs that one photo, not the row.
      let done = 0
      let failed = 0
      if (embeddedTotal) setProgress({ done: 0, total: embeddedTotal })
      const products = []
      for (const r of validRows) {
        const urls = [...(r.product.images || [])]
        for (const img of r.embedded) {
          try {
            const file = new File([img.bytes], img.name, { type: img.type })
            urls.push(await uploadImage(file, "products"))
          } catch (err) {
            console.error("Embedded image upload failed:", err)
            failed++
          }
          setProgress({ done: ++done, total: embeddedTotal })
        }
        products.push({ ...r.product, images: urls.slice(0, 8) })
      }

      await repo.bulkCreate("products", products)
      toast.success(`Imported ${products.length} product${products.length > 1 ? "s" : ""}`)
      if (failed > 0) toast.warning(`${failed} photo${failed > 1 ? "s" : ""} could not be uploaded — add them on the product.`)
      reset()
      onClose()
    } catch (err) {
      console.error("Import failed:", err)
      toast.error("Import failed — nothing was saved")
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const reset = () => {
    setRows(null)
    setFileName("")
    setProgress(null)
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
            {progress
              ? `Uploading photos ${progress.done} of ${progress.total}…`
              : rows
                ? `${validRows.length} ready${invalidCount ? ` · ${invalidCount} skipped` : ""}${withImages ? ` · ${withImages} with photos` : ""}`
                : "Download the template · fill it in · upload it back"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reset} disabled={!rows || busy}>
              Clear
            </Button>
            <Button size="sm" onClick={commit} disabled={!validRows.length || busy}>
              <CheckCircle2 className="h-4 w-4" /> {busy ? "Importing…" : `Import ${validRows.length || ""}`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Steps */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="squircle flex flex-col items-start gap-2 rounded-[16px] border border-border p-4">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
              <Download className="h-[18px] w-[18px]" />
            </span>
            <span className="font-semibold text-foreground">1. Get the template</span>
            <span className="text-xs text-muted-foreground">Columns, sample rows and a "How to fill" sheet.</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Button size="xs" onClick={downloadExcel} disabled={busy}>Excel</Button>
              <Button size="xs" variant="outline" onClick={downloadTemplate}>CSV</Button>
            </div>
          </div>

          <div className="squircle flex flex-col items-start gap-2 rounded-[16px] border border-border p-4">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground">
              <FileSpreadsheet className="h-[18px] w-[18px]" />
            </span>
            <span className="font-semibold text-foreground">2. Fill it in</span>
            <span className="text-xs text-muted-foreground">
              By hand or with an AI. Paste product photos straight into the sheet, on the product's row.
            </span>
            <Button size="xs" variant="outline" className="mt-1" onClick={copyPrompt}>
              <Sparkles className="h-3.5 w-3.5" /> Copy AI prompt
            </Button>
          </div>

          <label className="squircle flex cursor-pointer flex-col items-start gap-2 rounded-[16px] border border-border p-4 transition-colors hover:bg-subtle">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
              <Upload className="h-[18px] w-[18px]" />
            </span>
            <span className="font-semibold text-foreground">3. Upload</span>
            <span className="text-xs text-muted-foreground">{fileName || "Choose your filled .xlsx or .csv"}</span>
            <input
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onFile}
              className="hidden"
            />
          </label>
        </div>

        {/* Preview */}
        {rows && (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-foreground">Preview</span>
              <Badge tone="emerald">{validRows.length} ready</Badge>
              {invalidCount > 0 && <Badge tone="rose">{invalidCount} with errors</Badge>}
              {withImages > 0 && <Badge tone="blue">{withImages} with photos</Badge>}
              {embeddedTotal > 0 && <Badge tone="violet">{embeddedTotal} pasted, uploaded on import</Badge>}
            </div>
            <div className="squircle max-h-72 overflow-auto rounded-[16px] border border-border">
              <table className="w-full text-left text-sm">
                <thead className="mt-head sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 font-medium" />
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                    <th className="px-3 py-2 text-right font-medium">GST</th>
                    <th className="px-3 py-2 font-medium">Photos</th>
                  </tr>
                </thead>
                <tbody className="mt-body">
                  {rows.map((r, i) => (
                    <tr key={i} className={r.valid ? "" : "bg-destructive/5"}>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.valid ? (
                          <CheckCircle2 className="h-4 w-4 text-success-text" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-destructive-text" title={r.errors.join(", ")} />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{r.product.name}</div>
                        {!r.valid && <div className="text-xs text-destructive-text">{r.errors.join(", ")}</div>}
                        {r.valid && r.droppedImages && (
                          <div className="text-xs text-warning-text">Image links ignored — they must start with http(s)://</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.product.category}</td>
                      <td className="px-3 py-2 text-right tabular text-muted-foreground">₹{r.product.basePrice}</td>
                      <td className="px-3 py-2 text-right tabular text-muted-foreground">{r.product.gstRate}%</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {photoCount(r) ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs"
                            title={
                              r.embedded.length
                                ? `${r.embedded.length} pasted into the sheet${r.product.images.length ? `, ${r.product.images.length} from links` : ""}`
                                : "From imageUrls links"
                            }
                          >
                            <ImageIcon className="h-3.5 w-3.5" /> {photoCount(r)}
                            {r.embedded.length > 0 && <span className="text-subtle-foreground">·&nbsp;pasted</span>}
                          </span>
                        ) : (
                          <span className="text-xs text-subtle-foreground">—</span>
                        )}
                      </td>
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
