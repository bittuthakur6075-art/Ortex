import { useState } from "react"
import { toast } from "sonner"
import { Upload, CheckCircle2, AlertTriangle } from "../../components/ui/Icons"
import { repo } from "../../data/store/repository"
import { currentUserId } from "../../lib/auth"
import { syncInvoicePaid } from "../../data/domain/domain"
import { Button, Badge, Banner, Drawer } from "../../components/ui/Ui"
import { formatCurrency, formatDate } from "../../lib/format"
import { decodeXmlBytes, parseTallyFiles, planTallyImport, countByStatus, STATUS } from "../../lib/tallyImport"

// Billing -> Import from Tally (admins only). Manual: a person exports XML from
// TallyPrime and drops the files here; nothing connects to Tally. Step 1 how to
// export, step 2 what each file would do, step 3 the writes, in the order the
// records depend on each other. A row that fails never stops the rest.

const KINDS = [
  { key: "customers", label: "Customers", collection: "customers" },
  { key: "products", label: "Stock items", collection: "products" },
  { key: "invoices", label: "Sales invoices", collection: "invoices" },
  { key: "receipts", label: "Receipts (money in)", collection: "payments" },
  { key: "payouts", label: "Payments out", collection: "payments" },
]
const TONE = { new: "emerald", changed: "blue", same: "slate", console: "violet", skipped: "amber", problem: "rose" }
const MAX_BYTES = 60 * 1024 * 1024
const PARALLEL = 6

// What the masters taught (voucher types, groups, ledgers), kept per signed-in
// person in this browser so a later Day Book alone still reads them. Losing it
// (private window, cleared storage) only means uploading the masters again.
const mastersKey = () => `ortex.tallyMasters.${currentUserId() || "local"}`
function loadMasters() {
  try {
    return JSON.parse(localStorage.getItem(mastersKey()) || "null") || undefined
  } catch {
    return undefined
  }
}
function saveMasters(m) {
  try {
    localStorage.setItem(mastersKey(), JSON.stringify(m))
  } catch {
    // Storage full or blocked: the next upload just knows less.
  }
}

async function inBatches(items, fn) {
  for (let i = 0; i < items.length; i += PARALLEL) await Promise.all(items.slice(i, i + PARALLEL).map((x, j) => fn(x, i + j)))
}

function HowToExport() {
  return (
    <div className="space-y-3 text-[13px] text-muted-foreground">
      <div>
        <p className="font-medium text-foreground">Vouchers (sales, receipts, payments)</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>In TallyPrime open Display More Reports, then Day Book.</li>
          <li>Press Alt+F2 (Period) and set the dates you want. For the first import, choose the whole period you want in the console.</li>
          <li>Press Alt+E (Export), choose Format: XML (Data Interchange), and export.</li>
        </ol>
      </div>
      <div>
        <p className="font-medium text-foreground">Customers and stock items (optional, recommended once)</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Open Display More Reports, then List of Accounts.</li>
          <li>Press Alt+E (Export), choose Masters if asked, and Format: XML (Data Interchange).</li>
          <li>For stock items do the same from the List of Stock Items, or include them in the masters export.</li>
        </ol>
      </div>
      <p>Your Tally version may name these menus slightly differently. Upload as many files as you like, now or later: anything already imported is recognised and skipped.</p>
    </div>
  )
}

function KindSection({ kind, rows, included, onToggle }) {
  const counts = countByStatus(rows)
  const writes = rows.filter((r) => r.action).length
  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
          <input type="checkbox" checked={included} disabled={!writes} onChange={onToggle} className="h-4 w-4 cursor-pointer rounded border-border accent-primary" />
          {kind.label}
        </label>
        <span className="text-xs text-muted-foreground">{rows.length} in the files</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {Object.entries(counts).filter(([, n]) => n).map(([s, n]) => (
            <Badge key={s} tone={TONE[s]}>{STATUS[s]} {n}</Badge>
          ))}
        </div>
      </div>
      {rows.length > 0 && (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-primary">Show rows</summary>
          <div className="scroll-thin max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="mt-head sticky top-0 z-10">
                <tr><th>Record</th><th>Date</th><th className="text-right">Amount</th><th>Status</th><th>Why</th></tr>
              </thead>
              <tbody className="mt-body">
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <div className="font-medium text-foreground">{r.title}</div>
                      {r.sub && <div className="text-xs text-muted-foreground">{r.sub}</div>}
                    </td>
                    <td className="whitespace-nowrap text-xs text-muted-foreground">{r.date ? formatDate(r.date) : ""}</td>
                    <td className="whitespace-nowrap text-right tabular">{r.amount != null ? formatCurrency(r.amount) : ""}</td>
                    <td><Badge tone={TONE[r.status]}>{STATUS[r.status]}</Badge></td>
                    <td className={r.flagged ? "text-xs text-warning-text" : "text-xs text-muted-foreground"}>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}

export default function TallyImport({ open, onClose }) {
  const [files, setFiles] = useState([])
  const [parsed, setParsed] = useState(null)
  const [plan, setPlan] = useState(null)
  const [include, setInclude] = useState(() => Object.fromEntries(KINDS.map((k) => [k.key, true])))
  const [busy, setBusy] = useState("")
  const [summary, setSummary] = useState(null)

  const reset = () => {
    setFiles([])
    setParsed(null)
    setPlan(null)
    setSummary(null)
    setBusy("")
  }

  const addFiles = async (list) => {
    const picked = [...(list || [])].filter((f) => /\.xml$/i.test(f.name) || f.type.includes("xml"))
    if (!picked.length) return toast.error("Choose the .xml files exported from TallyPrime.")
    const big = picked.find((f) => f.size > MAX_BYTES)
    if (big) return toast.error(`${big.name} is over 60 MB. Export a shorter period at a time.`)
    setBusy("Reading the files")
    try {
      const read = await Promise.all(picked.map(async (f) => ({ name: f.name, text: decodeXmlBytes(await f.arrayBuffer()) })))
      const all = [...files.filter((f) => !read.some((r) => r.name === f.name)), ...read]
      const p = parseTallyFiles(all, { masters: loadMasters() })
      saveMasters(p.masters)
      const [customers, products, invoices, payments, categories] = await Promise.all(
        ["customers", "products", "invoices", "payments", "categories"].map((c) => repo.list(c)),
      )
      setFiles(all)
      setParsed(p)
      setPlan(planTallyImport(p, { customers, products, invoices, payments }, { categories: categories.map((c) => c.name).filter(Boolean) }))
    } catch (e) {
      console.error(e)
      toast.error(`Could not read the files: ${e?.message || e}`)
    } finally {
      setBusy("")
    }
  }

  const toWrite = plan ? KINDS.filter((k) => include[k.key]).reduce((n, k) => n + plan[k.key].filter((r) => r.action).length, 0) : 0

  const runImport = async () => {
    const invoiceIds = new Map()
    const touched = new Set()
    const result = []
    for (const kind of KINDS) {
      if (!include[kind.key]) continue
      const rows = plan[kind.key].filter((r) => r.action)
      const res = { label: kind.label, created: 0, updated: 0, unlinked: 0, failed: [] }
      let done = 0
      await inBatches(rows, async (r) => {
        try {
          let data = r.action === "create" ? r.doc : r.patch
          if (r.link?.invoiceKey) {
            const id = invoiceIds.get(r.link.invoiceKey)
            if (id) data = { ...data, invoiceId: id }
            else {
              data = { ...data, invoiceId: null, invoiceNumber: "" }
              res.unlinked++
            }
          }
          if (r.action === "create") {
            const row = await repo.create(kind.collection, data)
            if (kind.key === "invoices") invoiceIds.set(r.key, row.id)
            res.created++
          } else {
            await repo.update(kind.collection, r.id, data)
            if (kind.key === "invoices") touched.add(r.id)
            res.updated++
          }
          if (data.invoiceId) touched.add(data.invoiceId)
        } catch (e) {
          res.failed.push({ title: r.title, error: e?.message || String(e) })
        }
        done++
        setBusy(`${kind.label}: ${done} of ${rows.length}`)
      })
      result.push(res)
    }
    // Demo mode only: on Supabase the 0066 trigger has already settled them.
    // Every invoice a payment points to, and every invoice whose total changed.
    for (const id of touched) await syncInvoicePaid(id).catch(() => {})
    setBusy("")
    setSummary(result)
  }

  const start = () => {
    setBusy("Starting")
    runImport().catch((e) => {
      setBusy("")
      toast.error(e?.message || "The import stopped")
    })
  }

  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  const footer = summary ? (
    <div className="flex justify-end gap-2.5">
      <Button variant="outline" size="sm" onClick={reset}>Import more files</Button>
      <Button size="sm" onClick={close}>Done</Button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-muted-foreground">{busy || (plan ? `${toWrite} record(s) to create or update` : "No files yet")}</span>
      <div className="flex gap-2.5">
        <Button variant="outline" size="sm" onClick={reset} disabled={!files.length || !!busy}>Clear</Button>
        <Button size="sm" onClick={start} disabled={!toWrite || !!busy}>Import {toWrite || ""}</Button>
      </div>
    </div>
  )

  return (
    <Drawer open={open} onClose={close} title="Import from Tally" subtitle="Sales, receipts, payments, customers and stock items from TallyPrime XML" width="max-w-4xl" footer={footer}>
      {summary ? (
        <div className="space-y-3">
          <Banner tone={summary.some((s) => s.failed.length) ? "warning" : "success"}>
            {summary.some((s) => s.failed.length) ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            Import finished.
          </Banner>
          {summary.map((s) => (
            <div key={s.label} className="rounded-lg border border-border px-4 py-3 text-sm">
              <p className="font-medium text-foreground">{s.label}</p>
              <p className="text-muted-foreground">
                {s.created} created, {s.updated} updated, {s.failed.length} failed
                {s.unlinked ? `. ${s.unlinked} saved unlinked because their invoice was not imported` : ""}
              </p>
              {s.failed.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-destructive-text">
                  {s.failed.map((f, i) => <li key={i}>{f.title}: {f.error}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">1. Export from TallyPrime</h3>
            <HowToExport />
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 p-6 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                addFiles(e.dataTransfer.files)
              }}
            >
              <Upload className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium text-foreground">Drop the XML files here, or choose them</span>
              <span className="text-xs text-muted-foreground">One or more .xml files. Day Book and masters can go together.</span>
              <input type="file" accept=".xml,text/xml" multiple className="hidden" disabled={!!busy} onChange={(e) => { addFiles(e.target.files); e.target.value = "" }} />
            </label>
            {parsed && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {parsed.files.map((f) => (
                  <li key={f.name}>
                    <span className="font-medium text-foreground">{f.name}</span>: {f.vouchers} vouchers, {f.ledgers} ledgers, {f.stockItems} stock items
                  </li>
                ))}
              </ul>
            )}
          </section>

          {plan && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">2. Check what will happen</h3>
              {(Object.keys(parsed.others).length > 0 || parsed.cancelled > 0 || parsed.otherLedgers > 0) && (
                <p className="text-xs text-muted-foreground">
                  Left out:{" "}
                  {[
                    ...Object.entries(parsed.others).map(([t, n]) => `${n} ${t}`),
                    parsed.cancelled ? `${parsed.cancelled} cancelled or optional` : "",
                    parsed.otherLedgers ? `${parsed.otherLedgers} ledgers outside Sundry Debtors` : "",
                  ].filter(Boolean).join(", ")}.
                </p>
              )}
              {KINDS.map((k) => (
                <KindSection key={k.key} kind={k} rows={plan[k.key]} included={include[k.key]} onToggle={() => setInclude((s) => ({ ...s, [k.key]: !s[k.key] }))} />
              ))}
              <p className="text-xs text-muted-foreground">
                3. Import writes customers, stock items, invoices, receipts and payments out, in that order. Stock items arrive as drafts, never on the website. Everything imported is marked as already in Tally.
              </p>
            </section>
          )}
        </div>
      )}
    </Drawer>
  )
}
