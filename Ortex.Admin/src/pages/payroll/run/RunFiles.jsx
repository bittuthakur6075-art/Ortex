import { useState } from "react"
import { toast } from "sonner"
import { Download } from "../../../components/ui/Icons"
import { Button, Card, CardHeader } from "../../../components/ui/Ui"
import { downloadPayslipsPdf } from "../../../components/documents/payslipPdf"
import { downloadBankFile, downloadEcr, downloadEsic, downloadRegister, downloadTdsSummary } from "./files"

// The files an approved run hands to the bank, EPFO, ESIC and the books. The
// bank file carries full account numbers, so reading it is logged in the
// payroll history (payroll_bank_details).

export default function RunFiles({ run, rows, settings, org, title }) {
  const [busy, setBusy] = useState(null)
  const included = rows.filter((r) => r.status === "included")

  const go = async (key, fn) => {
    setBusy(key)
    try {
      const warnings = await fn()
      if (Array.isArray(warnings) && warnings.length) {
        toast.warning(`${warnings.length} to check: ${warnings.slice(0, 3).join("; ")}${warnings.length > 3 ? "…" : ""}`, { duration: 9000 })
      }
    } catch (e) {
      toast.error(e.message || "Could not make the file")
    } finally {
      setBusy(null)
    }
  }

  const files = [
    { key: "bank", name: "Bank transfer file", hint: "NEFT bulk upload, columns as set in Settings", run: () => downloadBankFile(run, rows, settings) },
    { key: "ecr", name: "EPFO ECR", hint: "Text file for the EPFO portal, one line per member", run: () => downloadEcr(run, rows) },
    { key: "esic", name: "ESIC upload", hint: "Spreadsheet for the ESIC portal, every cell as text", run: () => downloadEsic(run, rows) },
    { key: "register", name: "Salary register", hint: "Form IV style, every component a column (xlsx)", run: () => downloadRegister(run, rows) },
    { key: "register-csv", name: "Salary register (CSV)", hint: "The same register for Tally or a spreadsheet", run: () => downloadRegister(run, rows, { csv: true }) },
    { key: "tds", name: "TDS summary", hint: "Each person's TDS and the projection behind it (CSV)", run: () => downloadTdsSummary(run, rows) },
    {
      key: "payslips",
      name: "All payslips",
      hint: `${included.length} payslips in one PDF, a page each`,
      run: () =>
        downloadPayslipsPdf(
          included.map((r) => ({ slip: r.data, status: r.status, title, payDate: run.pay_date })),
          org,
          `payslips-${String(run.month).slice(0, 7)}`,
        ),
      disabled: !included.length,
    },
  ]

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Files" description="For the bank, EPFO, ESIC and the books. Downloading the bank file is recorded in the payroll history." />
      <div className="divide-y divide-border border-t border-border">
        {files.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{f.name}</div>
              <div className="text-[12px] text-muted-foreground">{f.hint}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => go(f.key, f.run)} disabled={Boolean(busy) || f.disabled}>
              <Download className="h-4 w-4" /> {busy === f.key ? "Working…" : "Download"}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )
}
