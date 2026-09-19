import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import PayslipSheet from "./PayslipSheet"
import { buildSheetPdf } from "./documentPdf"

// Payslip PDFs, on the quotation's path (documentPdf.jsx): the sheet is
// rendered off screen at exactly 794px (A4 at 96dpi) and captured by
// html2pdf.js, so the file is the page a person sees in the preview.

const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** "September 2026" from a payslip's month ("2026-09-01"). */
export function payslipMonthLabel(month) {
  if (!month) return ""
  const [y, m] = String(month).split("-").map(Number)
  return `${LONG[m - 1]} ${y}`
}

/** "payslip-september-2026-rahul-sharma" */
export function payslipFileStem(slip) {
  const month = payslipMonthLabel(slip?.month).toLowerCase().replace(/\s+/g, "-")
  const name = String(slip?.employee?.name || "employee")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `payslip-${month}-${name}`
}

async function withSheets(items, org, fn) {
  const host = document.createElement("div")
  Object.assign(host.style, { position: "fixed", left: "-10000px", top: "0", width: "794px", pointerEvents: "none" })
  host.setAttribute("aria-hidden", "true")
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    const els = []
    flushSync(() => {
      root.render(
        <>
          {items.map((it, i) => (
            <PayslipSheet
              key={i}
              ref={(n) => {
                els[i] = n
              }}
              slip={it.slip}
              status={it.status}
              title={it.title}
              org={org}
              className="!m-0 !shadow-none"
            />
          ))}
        </>,
      )
    })
    if (document.fonts?.ready) await document.fonts.ready
    return await fn(els)
  } finally {
    root.unmount()
    host.remove()
  }
}

/** One payslip as a jsPDF. `item` is { slip, status, title }. */
export function renderPayslipPdf(item, org, fileStem) {
  return withSheets([item], org, ([el]) => buildSheetPdf(el, fileStem || payslipFileStem(item.slip)))
}

/** Render and save one payslip. */
export async function downloadPayslipPdf(item, org) {
  const stem = payslipFileStem(item.slip)
  const pdf = await renderPayslipPdf(item, org, stem)
  pdf.save(`${stem}.pdf`)
}

/**
 * Every payslip of a run in one PDF, a page each. html2pdf.js chains a page
 * per sheet onto the same document (its documented multi-page pattern).
 */
export async function downloadPayslipsPdf(items, org, fileStem) {
  if (!items.length) return
  const html2pdf = (await import("html2pdf.js")).default
  await withSheets(items, org, async (els) => {
    const prev = els.map((el) => ({ width: el.style.width, minHeight: el.style.minHeight, margin: el.style.margin }))
    for (const el of els) Object.assign(el.style, { width: "794px", minHeight: "1123px", margin: "0" })
    try {
      let worker = html2pdf()
        .set({
          margin: 0,
          filename: `${fileStem}.pdf`,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", letterRendering: false },
          jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
        })
        .from(els[0])
        .toPdf()
      for (const el of els.slice(1)) {
        worker = worker
          .get("pdf")
          .then((pdf) => {
            pdf.addPage()
          })
          .from(el)
          .toContainer()
          .toCanvas()
          .toPdf()
      }
      await worker.save()
    } finally {
      els.forEach((el, i) => Object.assign(el.style, prev[i]))
    }
  })
}
