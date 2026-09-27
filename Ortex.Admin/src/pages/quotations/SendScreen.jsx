import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { ArrowLeft, Download, Pencil, MessageCircle, Mail, Copy, CheckCircle2, AlertTriangle, Printer, Plus, Minus } from "../../components/ui/Icons"
import DocumentSheet from "../../components/documents/DocumentSheet"
import AiWriter from "../../components/ui/AiWriter"
import { cn } from "../../lib/cn"
import { hasPhone, quotationFileName, quotationShareMessage } from "../../lib/quotationShare"
import { quoteChecks, rupees } from "../../lib/salesWork"
import { prettyPhone } from "../voice-leads/helpers"
import { Initials } from "../../components/sales/ListParts"
import { downloadPdf, sendQuotation, startWhatsAppShare } from "./actions"

const dm = (ts) => new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
const firstName = (n = "") => n.trim().split(/\s+/)[0] || ""

// Message templates for the WhatsApp covering note. "First send" is the
// console's standard message (lib/quotationShare), the others build on it.
function template(kind, q, settings) {
  const name = firstName(q.customer?.name)
  const me = q.sellerName ? `\n\n${firstName(q.sellerName)}, ${settings?.company?.name || "Ortex Industries"}` : ""
  const total = rupees(q.totals?.grandTotal)
  const until = q.validUntil ? `, valid until ${dm(q.validUntil)}` : ""
  if (kind === "reminder") {
    return `Hi${name ? ` ${name}` : ""}, hope all is well. Sharing our quotation ${q.number} again for ${total} incl. GST${until}. Happy to adjust quantities or send a sample first. Shall we go ahead?${me}`
  }
  if (kind === "final") {
    return `Hi${name ? ` ${name}` : ""}, a quick note that quotation ${q.number} (${total} incl. GST) is valid only till ${q.validUntil ? dm(q.validUntil) : "soon"}. Let me know if you would like us to block production.${me}`
  }
  return quotationShareMessage(q, settings) + me
}

const TEMPLATES = [
  { value: "first", label: "First send" },
  { value: "reminder", label: "Gentle reminder" },
  { value: "final", label: "Validity ending" },
]

// Preview and send (Figma "V2 · Quotation preview and send"): the real A4
// document at full size on the left, and a send panel on the right with the
// channel, recipient, the covering message, the PDF, pre-send checks and the
// send history.
export default function SendScreen({ q, settings, onClose, onEdit }) {
  const sent = (q?.sendLog || []).length > 0 || q?.status === "sent"
  const [zoom, setZoom] = useState(100)
  const [channel, setChannel] = useState(hasPhone(q?.customer?.phone) ? "whatsapp" : "email")
  const [kind, setKind] = useState(sent ? "reminder" : "first")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (q) setMessage(template(kind, q, settings))
  }, [q, kind, settings])

  useEffect(() => {
    if (!q) return
    document.body.classList.add("doc-open")
    const onKey = (e) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.classList.remove("doc-open")
      window.removeEventListener("keydown", onKey)
    }
  }, [q, onClose])

  const checks = useMemo(() => (q ? quoteChecks(q, settings) : []), [q, settings])
  if (!q) return null

  const c = q.customer || {}
  const log = [...(q.sendLog || [])].reverse()
  const lastSent = q.sentAt || log[0]?.at
  const bad = checks.filter((x) => !x.ok)

  const send = async () => {
    if (busy) return
    setBusy(true)
    try {
      const ok = channel === "whatsapp" ? await startWhatsAppShare(q, settings, message) : await sendQuotation(q, settings)
      if (ok) onClose()
    } finally {
      setBusy(false)
    }
  }

  const copy = () => navigator.clipboard?.writeText(message).then(() => toast.success("Message copied"), () => toast.error("Could not copy"))

  return createPortal(
    <div className="send-screen fixed inset-0 z-50 flex bg-background" role="dialog" aria-modal="true" aria-label={`Send ${q.number}`}>
      {/* Document */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="no-print flex h-14 flex-none items-center gap-3 border-b border-border bg-card px-4">
          <button type="button" onClick={onClose} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full border border-line hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-foreground">
              {q.number || "Draft"} · {c.company || c.name || "No customer"}
            </div>
            <div className="truncate text-xs text-muted-foreground">A4 · what the customer will see</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="squircle hidden items-center rounded-[10px] border border-line sm:flex">
              <button type="button" onClick={() => setZoom((z) => Math.max(50, z - 10))} aria-label="Zoom out" className="grid h-8 w-8 place-items-center text-muted-foreground hover:text-foreground">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-12 text-center text-xs font-semibold tabular">{zoom}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(150, z + 10))} aria-label="Zoom in" className="grid h-8 w-8 place-items-center text-muted-foreground hover:text-foreground">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <ToolbarBtn icon={Printer} onClick={() => window.print()}>Print</ToolbarBtn>
            <ToolbarBtn icon={Download} onClick={() => downloadPdf(q, settings)}>Download PDF</ToolbarBtn>
            {onEdit && <ToolbarBtn icon={Pencil} onClick={onEdit}>Edit</ToolbarBtn>}
          </div>
        </div>
        <div className="doc-scroll flex-1 overflow-auto bg-[hsl(var(--table-head))] py-8">
          <div data-zoom className="mx-auto w-fit" style={{ zoom: zoom / 100 }}>
            <DocumentSheet doc={q} settings={settings} type="quotation" />
          </div>
        </div>
      </div>

      {/* Send panel */}
      <aside className="no-print flex w-full max-w-[420px] flex-none flex-col border-l border-border bg-card">
        <div className="flex-none border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Send quotation</h2>
          <p className="text-xs text-muted-foreground">
            {log.length ? `Sent ${log.length === 1 ? "once" : log.length === 2 ? "twice" : `${log.length} times`} before · last on ${dm(lastSent)}` : lastSent ? `Sent on ${dm(lastSent)}` : q.status === "draft" ? "Not sent yet" : "Sent earlier, before sends were logged"}
          </p>
        </div>

        <div className="scroll-thin flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          <div className="squircle grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
            {[
              { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
              { key: "email", label: "Email", icon: Mail },
              { key: "copy", label: "Copy text", icon: Copy },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setChannel(t.key)}
                className={cn("flex h-9 items-center justify-center gap-1.5 rounded-lg text-[13px]", channel === t.key ? "bg-card font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground")}
              >
                <t.icon className={cn("h-4 w-4", t.key === "whatsapp" && "text-success-text")} /> {t.label}
              </button>
            ))}
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-foreground">To</p>
            <div className="squircle flex min-h-11 items-center gap-2 rounded-xl border border-line px-2.5">
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-muted py-1 pl-1 pr-2.5 text-[13px] font-medium text-foreground">
                <Initials name={c.name || c.company} size={20} />
                <span className="truncate">
                  {firstName(c.name) || c.company || "Customer"} · {channel === "email" ? c.email || "no email" : c.phone ? prettyPhone(c.phone) : "no phone"}
                </span>
              </span>
            </div>
            {channel === "whatsapp" && !hasPhone(c.phone) && <p className="mt-1.5 text-xs text-warning-text">No phone number on this quotation. The PDF downloads, but no chat opens.</p>}
            {channel === "email" && !c.email && <p className="mt-1.5 text-xs text-warning-text">No email on this quotation. It goes to the notification address in Settings.</p>}
          </div>

          {channel !== "email" ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[13px] font-medium text-foreground">Message</p>
                <label className="relative text-xs text-muted-foreground">
                  Template: <span className="font-semibold text-primary">{TEMPLATES.find((t) => t.value === kind).label} ▾</span>
                  <select value={kind} onChange={(e) => setKind(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Template">
                    {TEMPLATES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="squircle rounded-xl border border-line focus-within:border-primary">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} className="block w-full resize-none bg-transparent px-3.5 pt-3 text-[13.5px] leading-[21px] text-foreground outline-none" />
                <div className="flex justify-end px-2.5 pb-2.5">
                  <AiWriter
                    value={message}
                    onApply={setMessage}
                    purpose="A short WhatsApp covering message from Ortex Industries sales sending or following up a quotation. Keep the quotation number, amount and validity exactly as given."
                    context={() => ({ number: q.number, total: q.totals?.grandTotal, validUntil: q.validUntil, customer: firstName(c.name), items: (q.lines || []).map((l) => l.description).slice(0, 6) })}
                    maxChars={500}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="squircle rounded-xl bg-muted px-3.5 py-3 text-xs leading-5 text-muted-foreground">
              The email uses your quotation email template (Settings, Notifications) with the PDF attached.
            </p>
          )}

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-foreground">Attached</p>
            <div className="squircle flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-destructive/10 text-[10px] font-bold text-destructive-text">PDF</span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-foreground">{quotationFileName(q)}</div>
                <div className="text-[11px] text-muted-foreground">A4 · {rupees(q.totals?.grandTotal)} incl. GST</div>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-1.5 flex items-center justify-between text-[13px] font-medium text-foreground">
              Before you send
              <span className="text-xs font-normal text-muted-foreground">
                {checks.length - bad.length} of {checks.length} ready
              </span>
            </p>
            <ul className="space-y-1.5 text-xs">
              {checks.map((x) => (
                <li key={x.key} className={cn("flex items-start gap-2", x.ok ? "text-foreground" : x.warn ? "text-warning-text" : "text-destructive-text")}>
                  {x.ok ? <CheckCircle2 className="mt-px h-3.5 w-3.5 flex-none text-success-text" /> : <AlertTriangle className="mt-px h-3.5 w-3.5 flex-none" />}
                  {x.text}
                </li>
              ))}
            </ul>
          </div>

          {log.length > 0 && (
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-foreground">History</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {log.map((l, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {l.channel === "whatsapp" ? <MessageCircle className="h-3.5 w-3.5 text-success-text" /> : <Mail className="h-3.5 w-3.5" />}
                    {l.channel === "whatsapp" ? "WhatsApp" : "Email"} · {new Date(l.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-none items-center gap-2 border-t border-border px-5 py-3">
          {channel === "copy" ? (
            <button type="button" onClick={copy} className="squircle flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground hover:bg-primary-hover">
              <Copy className="h-4 w-4" /> Copy message
            </button>
          ) : (
            <>
              <button type="button" onClick={copy} disabled={channel === "email"} className="squircle h-11 flex-none rounded-xl border border-line px-4 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-40">
                Copy
              </button>
              <button type="button" onClick={send} disabled={busy} className="squircle flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60">
                {channel === "whatsapp" ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                {busy ? "Preparing…" : channel === "whatsapp" ? "Send on WhatsApp" : "Send email"}
              </button>
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

function ToolbarBtn({ icon: Icon, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="squircle hidden h-9 items-center gap-2 rounded-[10px] border border-line bg-card px-3 text-[13px] font-medium text-foreground hover:bg-muted md:inline-flex">
      <Icon className="h-4 w-4 text-muted-foreground" /> {children}
    </button>
  )
}
