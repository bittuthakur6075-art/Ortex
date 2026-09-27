import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { PhoneOutgoing, MessageCircle, Mail, Send, RefreshCw, UserCheck, Calendar, UserTag, Sparkles, AlertTriangle, FileText } from "../../components/ui/Icons"
import { repo } from "../../data/store/repository"
import { ENQUIRY_STATUS, LOST_REASONS } from "../../data/domain/schema"
import { rfqToQuotationLines } from "../../lib/quoteRfq"
import { tomorrowAt10 } from "../../lib/salesWork"
import { waNumber } from "../voice-leads/helpers"
import { ActionMenu, statusSections } from "../../components/sales/ListParts"
import { callContact } from "../../components/sales/ContactCard"
import { STATUS_TONE } from "./model"
import { Button, Chip, Input, Modal } from "../../components/ui/Ui"

// People a lead can be assigned to. `owner` on an enquiry is a display name
// (it always was), so this is a list of names: the staff directory where the
// database has one, else just the signed-in person (demo mode).
export function useStaffNames(profile) {
  const [names, setNames] = useState([])
  useEffect(() => {
    let live = true
    Promise.resolve(repo.staffDirectory ? repo.staffDirectory() : {})
      .catch(() => ({}))
      .then((dir) => {
        if (!live) return
        const list = Object.values(dir || {}).map((p) => p.name).filter(Boolean)
        if (profile?.name && !list.includes(profile.name)) list.unshift(profile.name)
        setNames([...new Set(list)].sort((a, b) => a.localeCompare(b)))
      })
    return () => {
      live = false
    }
  }, [profile?.name])
  return names
}

export const telHref = (phone) => (phone ? `tel:${String(phone).replace(/[^\d+]/g, "")}` : null)
export const waHref = (phone) => {
  const n = waNumber(phone || "")
  return n && n.length >= 12 ? `https://wa.me/${n}` : null
}
export const mailHref = (email) => (email ? `mailto:${email}` : null)

// What the Call contact card shows for a lead.
export const contactOf = (e) => ({ name: e.customer?.name, company: e.customer?.company, phone: e.customer?.phone, altPhone: e.altPhone, email: e.customer?.email })
export const firstName = (name = "") => name.trim().split(/\s+/)[0] || ""

/**
 * Every write a lead can take, plus the pickers and dialogs they open.
 * Render `element` once on the page.
 */
export function useLeadActions({ products = [], staff = [], me = "" } = {}) {
  const navigate = useNavigate()
  const [dialog, setDialog] = useState(null) // { type: "lost" | "tag", e }
  const [picker, setPicker] = useState(null) // { anchor, sections }
  const [tag, setTag] = useState("")

  const patch = async (e, changes, message) => {
    try {
      await repo.update("enquiries", e.id, changes)
      if (message) toast.success(message)
    } catch (err) {
      toast.error(err?.message || "Could not save the lead")
    }
  }

  const setStatus = (e, status) => {
    if (status === "lost") return setDialog({ type: "lost", e })
    // Moving a lead on clears a snoozed date that belonged to the old step.
    // `statusAt` dates each step on the lead page's progress track.
    return patch(e, { status, followUpAt: null, statusAt: { ...e.statusAt, [status]: new Date().toISOString() } }, `Marked ${ENQUIRY_STATUS.find((s) => s.id === status)?.label.toLowerCase()}`)
  }

  const quote = (e) =>
    navigate("/quotations", {
      state: {
        fromEnquiry: {
          id: e.id,
          customer: e.customer,
          message: e.reference || "",
          lines: e.rfqItems?.length ? rfqToQuotationLines(e.rfqItems, products) : [],
        },
      },
    })

  const openQuote = (q) => navigate("/quotations", { state: { openId: q.id, send: true } })

  const pickStatus = (e, anchor) =>
    setPicker({
      anchor,
      sections: statusSections(e.status || "new", ENQUIRY_STATUS, STATUS_TONE, (id) => setStatus(e, id)),
    })

  const pickOwner = (e, anchor) =>
    setPicker({
      anchor,
      sections: [
        {
          title: "Assign to",
          items: [
            ...staff.map((n) => ({ icon: UserCheck, label: n, onSelect: () => patch(e, { owner: n }, `Assigned to ${firstName(n)}`) })),
            ...(e.owner ? [{ icon: UserCheck, label: "Unassigned", onSelect: () => patch(e, { owner: "" }, "Unassigned") }] : []),
          ],
        },
      ],
    })

  // A note, call, WhatsApp or follow-up written on the lead, kept on the doc as
  // `activity` (newest last). A call on a new lead also moves it to contacted.
  const logActivity = (e, type, text, extra = {}, message = "Saved") => {
    const at = new Date().toISOString()
    const entry = { id: crypto.randomUUID(), type, text: text.trim(), at, by: me }
    const moved = type === "call" && (e.status || "new") === "new" ? { status: "contacted", statusAt: { ...e.statusAt, contacted: at }, followUpAt: null } : {}
    return patch(e, { activity: [...(e.activity || []), entry], ...moved, ...extra }, message)
  }

  const followUp = (e, when = tomorrowAt10()) => patch(e, { followUpAt: when }, when ? "Follow-up set" : "Follow-up cleared")

  // The "···" menu of one row, each item with the key the design shows.
  const menu = (l, anchor) => {
    const e = l.e
    const c = e.customer || {}
    const name = firstName(c.name) || "them"
    const contact = [
      { icon: PhoneOutgoing, label: `Call ${name}`, key: "C", disabled: !telHref(c.phone), onSelect: () => callContact({ currentTarget: anchor }, contactOf(e)) },
      { icon: MessageCircle, label: "WhatsApp", key: "W", tone: "green", disabled: !waHref(c.phone), onSelect: () => window.open(waHref(c.phone), "_blank", "noopener") },
      { icon: Mail, label: "Email", key: "E", disabled: !c.email, onSelect: () => (window.location.href = mailHref(c.email)) },
    ]
    const along = [
      l.quote
        ? { icon: Send, label: "Resend quotation", key: "R", onSelect: () => openQuote(l.quote) }
        : { icon: FileText, label: "Create quotation", key: "Q", onSelect: () => quote({ ...e, rfqItems: l.items }) },
      { icon: RefreshCw, label: "Change status", hint: ENQUIRY_STATUS.find((s) => s.id === e.status)?.label, key: "S", onSelect: () => pickStatus(e, anchor) },
      { icon: UserCheck, label: "Assign to", hint: e.owner ? firstName(e.owner) : "No one", key: "A", onSelect: () => pickOwner(e, anchor) },
      { icon: Calendar, label: "Set follow-up", hint: "Tomorrow", key: "F", onSelect: () => followUp(e) },
      { icon: UserTag, label: "Add tag", key: "T", onSelect: () => (setTag(""), setDialog({ type: "tag", e })) },
      { icon: Sparkles, label: e.starred ? "Remove star" : "Star", key: "*", onSelect: () => patch(e, { starred: !e.starred }) },
    ]
    return [
      { title: "Contact", items: contact },
      { title: "Move it along", items: along },
      { items: [{ icon: AlertTriangle, label: "Mark as lost", key: "L", danger: true, disabled: e.status === "lost", onSelect: () => setDialog({ type: "lost", e }) }] },
    ]
  }

  const addTag = async () => {
    const t = tag.trim()
    if (!t) return
    const e = dialog.e
    await patch(e, { tags: [...new Set([...(e.tags || []), t])] }, "Tag added")
    setDialog(null)
  }

  const element = (
    <>
      <ActionMenu open={!!picker} anchor={picker?.anchor} sections={picker?.sections || []} onClose={() => setPicker(null)} />
      <Modal open={dialog?.type === "lost"} onClose={() => setDialog(null)} title="Why was this lead lost?" width="max-w-sm">
        <div className="flex flex-wrap gap-2">
          {LOST_REASONS.map((r) => (
            <Chip
              key={r}
              onClick={async () => {
                await patch(dialog.e, { status: "lost", lostReason: r, followUpAt: null, statusAt: { ...dialog.e.statusAt, lost: new Date().toISOString() } }, "Closed as lost")
                setDialog(null)
              }}
            >
              {r}
            </Chip>
          ))}
        </div>
      </Modal>
      <Modal
        open={dialog?.type === "tag"}
        onClose={() => setDialog(null)}
        title="Add a tag"
        width="max-w-sm"
        footer={
          <Button size="sm" onClick={addTag} disabled={!tag.trim()}>
            Add tag
          </Button>
        }
      >
        <Input autoFocus value={tag} maxLength={24} onChange={(ev) => setTag(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && addTag()} placeholder="e.g. Repeat buyer" />
      </Modal>
    </>
  )

  return { patch, logActivity, setStatus, quote, openQuote, pickStatus, pickOwner, followUp, menu, element }
}
