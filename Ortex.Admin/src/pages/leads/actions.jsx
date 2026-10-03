import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { PhoneOutgoing, MessageCircle, Mail, Send, RefreshCw, UserCheck, Calendar, Clock, UserTag, Sparkles, AlertTriangle, FileText } from "../../components/ui/Icons"
import { repo } from "../../data/store/repository"
import { ENQUIRY_STATUS, LOST_REASONS } from "../../data/domain/schema"
import { rfqToQuotationLines } from "../../lib/quoteRfq"
import { snoozePresets, tomorrowAt10 } from "../../lib/salesWork"
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
  const [dialog, setDialog] = useState(null) // { type: "lost" | "tag" | "date" | "delete", ... }
  const [picker, setPicker] = useState(null) // { anchor, sections }
  const [tag, setTag] = useState("")
  const [when, setWhen] = useState("")
  const [busy, setBusy] = useState(false)

  const patch = async (e, changes, message) => {
    try {
      await repo.update("enquiries", e.id, changes)
      if (message) toast.success(message)
    } catch (err) {
      toast.error(err?.message || "Could not save the lead")
    }
  }

  // A status change on one lead or several (a folded Anu call, a bulk pick).
  // It clears a snoozed date that belonged to the old step, dates the new step
  // in `statusAt` (the lead page's progress track), and offers Undo, which puts
  // each row's own status, dates, follow-up and lost reason back.
  const writeStatus = async (rows, status, extra = {}) => {
    const at = new Date().toISOString()
    const before = rows.map((r) => ({ id: r.id, status: r.status || "new", statusAt: r.statusAt || {}, followUpAt: r.followUpAt ?? null, lostReason: r.lostReason || "" }))
    try {
      await Promise.all(rows.map((r) => repo.update("enquiries", r.id, { status, followUpAt: null, statusAt: { ...r.statusAt, [status]: at }, ...extra })))
    } catch (err) {
      toast.error(err?.message || "Could not change the status")
      return false
    }
    const label = status === "lost" ? "Closed as lost" : `Marked ${ENQUIRY_STATUS.find((s) => s.id === status)?.label.toLowerCase()}`
    toast.success(rows.length > 1 ? `${label} · ${rows.length} leads` : label, {
      action: {
        label: "Undo",
        onClick: () =>
          Promise.all(before.map(({ id, ...prev }) => repo.update("enquiries", id, prev))).then(
            () => toast.success("Status put back"),
            (err) => toast.error(err?.message || "Could not undo"),
          ),
      },
    })
    return true
  }

  // `rows` (default: just this lead) all move together; Lost asks why first.
  const setStatus = (e, status, rows = [e]) => {
    if (!rows.length) return
    if (status === "lost") return setDialog({ type: "lost", rows })
    return writeStatus(rows, status)
  }

  const quote = (e) =>
    navigate("/quotations", {
      state: {
        fromEnquiry: {
          id: e.id,
          companyId: e.companyId,
          customer: e.customer,
          message: e.reference || "",
          lines: e.rfqItems?.length ? rfqToQuotationLines(e.rfqItems, products) : [],
        },
      },
    })

  const openQuote = (q) => navigate("/quotations", { state: { openId: q.id, send: true } })

  const pickStatus = (e, anchor, rows = [e]) =>
    setPicker({
      anchor,
      sections: statusSections(rows.length > 1 ? null : e.status || "new", ENQUIRY_STATUS, STATUS_TONE, (id) => setStatus(e, id, rows)),
    })

  // `onPick(name)` replaces the single-lead write (the bulk bar assigns many).
  const pickOwner = (e, anchor, onPick) =>
    setPicker({
      anchor,
      sections: [
        {
          title: "Assign to",
          items: [
            ...staff.map((n) => ({ icon: UserCheck, label: n, onSelect: () => (onPick ? onPick(n) : patch(e, { owner: n }, `Assigned to ${firstName(n)}`)) })),
            ...(onPick || e?.owner ? [{ icon: UserCheck, label: "Unassigned", onSelect: () => (onPick ? onPick("") : patch(e, { owner: "" }, "Unassigned")) }] : []),
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

  const followUp = (e, at = tomorrowAt10()) => patch(e, { followUpAt: at }, at ? "Follow-up set" : "Follow-up cleared")

  // The one follow-up control (lead page, preview, row menu, composer): the
  // presets, or a date and time of the person's own, never in the past.
  // `onPick(iso)` replaces the plain write (the composer logs it as activity).
  const pickFollowUp = (e, anchor, onPick) => {
    const pick = onPick || ((at) => followUp(e, at))
    setPicker({
      anchor,
      sections: [
        {
          title: "Follow up",
          items: [
            ...snoozePresets().map((p) => ({ icon: Clock, label: p.label, onSelect: () => pick(p.at) })),
            { icon: Calendar, label: "Pick a date", onSelect: () => (setWhen(localInput(tomorrowAt10())), setDialog({ type: "date", pick })) },
            ...(!onPick && e.followUpAt ? [{ icon: Clock, label: "Clear", onSelect: () => followUp(e, null) }] : []),
          ],
        },
      ],
    })
  }

  const saveDate = () => {
    const at = new Date(when)
    if (!when || Number.isNaN(at.getTime())) return toast.error("Pick a date and time")
    if (at.getTime() <= Date.now()) return toast.error("That time has passed. Pick one in the future.")
    dialog.pick(at.toISOString())
    setDialog(null)
  }

  // Delete after a confirm; Undo puts the same rows back (same ids and dates).
  // Callers offer it to admins only (see EnquiryDetail).
  const confirmDelete = (rows, after) => rows.length > 0 && setDialog({ type: "delete", rows, after })
  const doDelete = async () => {
    const { rows, after } = dialog
    setBusy(true)
    try {
      const results = await Promise.allSettled(rows.map((r) => repo.remove("enquiries", r.id)))
      const gone = rows.filter((_, i) => results[i].status === "fulfilled")
      if (gone.length < rows.length) toast.error(`Deleted ${gone.length} of ${rows.length}. ${results.find((r) => r.status === "rejected").reason?.message || "Please try again."}`)
      if (gone.length) {
        toast.success(gone.length === 1 ? "Lead deleted" : `${gone.length} leads deleted`, {
          action: {
            label: "Undo",
            onClick: () => repo.bulkCreate("enquiries", gone).then(() => toast.success("Put back"), (err) => toast.error(err?.message || "Could not undo")),
          },
        })
      }
      setDialog(null)
      if (gone.length) after?.(gone)
    } finally {
      setBusy(false)
    }
  }

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
      { icon: Calendar, label: "Set follow-up", key: "F", onSelect: () => pickFollowUp(e, anchor) },
      { icon: UserTag, label: "Add tag", key: "T", onSelect: () => (setTag(""), setDialog({ type: "tag", e })) },
      { icon: Sparkles, label: e.starred ? "Remove star" : "Star", key: "*", onSelect: () => patch(e, { starred: !e.starred }) },
    ]
    return [
      { title: "Contact", items: contact },
      { title: "Move it along", items: along },
      { items: [{ icon: AlertTriangle, label: "Mark as lost", key: "L", danger: true, disabled: e.status === "lost", onSelect: () => setDialog({ type: "lost", rows: [e] }) }] },
    ]
  }

  const addTag = async () => {
    const t = tag.trim()
    if (!t) return
    const e = dialog.e
    await patch(e, { tags: [...new Set([...(e.tags || []), t])] }, "Tag added")
    setDialog(null)
  }

  const deleting = dialog?.type === "delete" ? dialog.rows : []
  const element = (
    <>
      <ActionMenu open={!!picker} anchor={picker?.anchor} sections={picker?.sections || []} onClose={() => setPicker(null)} />
      <Modal open={dialog?.type === "lost"} onClose={() => setDialog(null)} title={dialog?.rows?.length > 1 ? `Why were these ${dialog.rows.length} leads lost?` : "Why was this lead lost?"} width="max-w-sm">
        <div className="flex flex-wrap gap-2">
          {LOST_REASONS.map((r) => (
            <Chip
              key={r}
              onClick={async () => {
                const rows = dialog.rows
                setDialog(null)
                await writeStatus(rows, "lost", { lostReason: r })
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
      <Modal
        open={dialog?.type === "date"}
        onClose={() => setDialog(null)}
        title="Follow up on"
        width="max-w-sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setDialog(null)}>Cancel</Button>
            <Button size="sm" onClick={saveDate}>Set follow-up</Button>
          </>
        }
      >
        <Input type="datetime-local" autoFocus aria-label="Follow-up date and time" value={when} min={localInput(Date.now())} onChange={(ev) => setWhen(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && saveDate()} />
      </Modal>
      <Modal
        open={dialog?.type === "delete"}
        onClose={busy ? () => {} : () => setDialog(null)}
        title={deleting.length > 1 ? `Delete ${deleting.length} leads?` : "Delete this lead?"}
        width="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>Cancel</Button>
            <Button variant="danger" onClick={doDelete} disabled={busy}>
              {busy ? "Deleting…" : deleting.length > 1 ? `Delete ${deleting.length} leads` : "Delete lead"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          {deleting.length === 1 && (
            <p className="font-semibold text-foreground">{[deleting[0].customer?.name || "Unnamed caller", deleting[0].reference].filter(Boolean).join(" · ")}</p>
          )}
          <p className="text-muted-foreground">Notes, calls and follow-ups on {deleting.length > 1 ? "them" : "it"} go too. Quotations already made are kept.</p>
          <p className="text-muted-foreground">You can undo straight after, from the message that confirms it.</p>
        </div>
      </Modal>
    </>
  )

  return { patch, logActivity, setStatus, quote, openQuote, pickStatus, pickOwner, pickFollowUp, followUp, confirmDelete, menu, element }
}

// A timestamp as a datetime-local input's value, in the browser's own zone.
function localInput(t) {
  const d = new Date(t)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
