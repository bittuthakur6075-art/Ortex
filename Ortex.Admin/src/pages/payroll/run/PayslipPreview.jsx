import { useState } from "react"
import { toast } from "sonner"
import { Download } from "../../../components/ui/Icons"
import { Button, Modal } from "../../../components/ui/Ui"
import PayslipSheet from "../../../components/documents/PayslipSheet"
import { downloadPayslipPdf, payslipMonthLabel } from "../../../components/documents/payslipPdf"

// The payslip at full A4 size with its PDF download, shared by a pay run's
// row drawer and My payslips. `item` is { slip, status, title, payDate }.
export default function PayslipPreview({ item, org, onClose }) {
  const [busy, setBusy] = useState(false)
  const download = async () => {
    setBusy(true)
    try {
      await downloadPayslipPdf(item, org)
    } catch (e) {
      toast.error(e.message || "Could not make the PDF")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      width="max-w-[880px]"
      title={item ? `Payslip · ${item.slip?.employee?.name || ""} · ${payslipMonthLabel(item.slip?.month)}` : ""}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={download} disabled={busy}>
            <Download className="h-4 w-4" /> {busy ? "Making PDF…" : "Download PDF"}
          </Button>
        </>
      }
    >
      {item && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <PayslipSheet slip={item.slip} status={item.status} title={item.title} payDate={item.payDate} org={org} className="!m-0 !shadow-none" />
        </div>
      )}
    </Modal>
  )
}
