import { useState, useEffect, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, CheckCircle2, Settings, Inbox } from "../ui/Icons"
import { Avatar, Button, Drawer, Badge } from "../ui/Ui"
import { useCollections } from "../../hooks/useCollection"
import { OPEN_LEAD_STAGES, LEAD_STAGES } from "../../data/domain/schema"
import { daysUntil, relativeTime, formatCurrency, formatDate } from "../../lib/format"
import { cn } from "../../lib/cn"

// Read / archived flags live in localStorage keyed by notification id, so the
// drawer stays useful without a server-side inbox. Ids are deterministic
// (built from the record id + signal kind) so the flags survive reloads.
const STORE_KEY = "ortex.admin.notifications"

function loadFlags() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}")
  } catch {
    return {}
  }
}

function saveFlags(flags) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(flags))
  } catch {
    /* private mode / quota — flags are a convenience only */
  }
}

const stageLabel = (stage) => LEAD_STAGES.find((s) => s.id === stage)?.label || stage
const partyName = (c) => c?.name || c?.company || "Unknown contact"
const partyCompany = (c) => (c?.company && c.company !== c.name ? c.company : "")
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

// Build the notification feed from live business signals. Each item is a
// small view-model: who (avatar + actor), what (rich title), meta (when +
// module), an optional detail block (quote / amount card / tags) and actions.
function buildFeed(data) {
  const out = []

  for (const e of data.enquiries || []) {
    if (e.status !== "new") continue
    const name = partyName(e.customer)
    const company = partyCompany(e.customer)
    out.push({
      id: `enq-new-${e.id}`,
      module: "Enquiries",
      avatar: name,
      when: e.createdAt,
      title: (
        <>
          <b>{name}</b>
          {company && <> from <b>{company}</b></>} sent a new enquiry
          {e.productInterest && <> for <b>{e.productInterest}</b></>}
        </>
      ),
      quote: e.message,
      tags: e.source ? [e.source] : [],
      primary: { label: "Open enquiry", to: "/crm?tab=enquiries" },
    })
  }

  for (const l of data.leads || []) {
    if (!OPEN_LEAD_STAGES.includes(l.stage) || !l.nextFollowUp) continue
    const days = daysUntil(l.nextFollowUp)
    if (days > 0) continue
    const name = partyName(l.customer)
    const company = partyCompany(l.customer)
    const overdue = days < 0
    out.push({
      id: `lead-fu-${l.id}-${l.nextFollowUp}`,
      module: "Leads",
      avatar: name,
      when: l.nextFollowUp,
      urgent: overdue,
      title: (
        <>
          Follow-up with <b>{name}</b>
          {company && <> ({company})</>}{" "}
          {overdue ? <>is <b>overdue by {plural(-days, "day")}</b></> : <>is <b>due today</b></>}
        </>
      ),
      tags: [stageLabel(l.stage), l.quantityEstimate, l.estimatedValue ? formatCurrency(l.estimatedValue) : null].filter(Boolean),
      primary: { label: "Open enquiry", to: "/crm?tab=enquiries" },
    })
  }

  for (const q of data.quotations || []) {
    if (q.status !== "sent" || !q.validUntil) continue
    const days = daysUntil(q.validUntil)
    if (days > 3) continue
    const name = partyName(q.customer)
    out.push({
      id: `qtn-exp-${q.id}-${q.validUntil}`,
      module: "Quotations",
      avatar: name,
      when: q.validUntil,
      urgent: days < 0,
      title: (
        <>
          Quotation <b>{q.number}</b> for <b>{name}</b>{" "}
          {days < 0 ? <>expired <b>{plural(-days, "day")} ago</b></> : days === 0 ? <>expires <b>today</b></> : <>expires in <b>{plural(days, "day")}</b></>}
        </>
      ),
      amount: { label: "Quote value", value: q.totals?.grandTotal, sub: `Valid till ${formatDate(q.validUntil)}` },
      primary: { label: "View quotation", to: "/quotations" },
    })
  }

  for (const inv of data.invoices || []) {
    if (!inv.dueDate || ["paid", "cancelled", "draft"].includes(inv.status)) continue
    const days = daysUntil(inv.dueDate)
    const overdue = inv.status === "overdue" || days < 0
    if (!overdue && days > 3) continue
    const name = partyName(inv.customer)
    const due = Math.max(0, (inv.totals?.grandTotal || 0) - (inv.amountPaid || 0))
    out.push({
      id: `inv-due-${inv.id}-${inv.dueDate}`,
      module: "Invoices",
      avatar: name,
      when: inv.dueDate,
      urgent: overdue,
      title: (
        <>
          Invoice <b>{inv.number}</b> for <b>{name}</b>{" "}
          {overdue ? <>is <b>overdue by {plural(Math.max(1, -days), "day")}</b></> : days === 0 ? <>is <b>due today</b></> : <>is due in <b>{plural(days, "day")}</b></>}
        </>
      ),
      amount: { label: "Balance due", value: due, sub: inv.status === "partial" ? "Partially paid" : "Unpaid" },
      primary: { label: "View invoice", to: "/billing?tab=invoices" },
    })
  }

  const weekAgo = Date.now() - 7 * 86400000
  for (const p of data.payments || []) {
    if (p.type !== "inflow" || !p.date || new Date(p.date).getTime() < weekAgo) continue
    const name = p.party || partyName(p.customer)
    out.push({
      id: `pay-in-${p.id}`,
      module: "Payments",
      avatar: name,
      when: p.date,
      title: (
        <>
          <b>{name}</b> paid <b>{formatCurrency(p.amount)}</b>
          {p.method && <> via {p.method}</>}
          {p.invoiceNumber && <> against <b>{p.invoiceNumber}</b></>}
        </>
      ),
      tags: [p.reference, p.note].filter(Boolean),
      primary: { label: "View payment", to: "/billing?tab=payments" },
    })
  }

  return out.sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0))
}

// ---- Row pieces -------------------------------------------------------------

function AmountCard({ amount }) {
  return (
    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-xl squircle bg-subtle px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{amount.label}</p>
        <p className="mt-0.5 text-base font-semibold text-foreground">{formatCurrency(amount.value || 0)}</p>
      </div>
      {amount.sub && <span className="text-xs text-muted-foreground">{amount.sub}</span>}
    </div>
  )
}

function ActionButton({ primary, children, ...props }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={primary ? "dark" : "outline"}
      className="transition-[background-color,opacity,transform] active:scale-[0.97]"
      {...props}
    >
      {children}
    </Button>
  )
}

function NotificationRow({ item, read, archived, onOpen, onToggleRead, onArchive }) {
  return (
    <li className={cn("relative flex gap-3 px-5 py-4 transition-colors hover:bg-subtle/60", !read && !archived && "bg-primary/[0.03]")}>
      <Avatar name={item.avatar} className="mt-0.5 h-10 w-10" />
      <div className="min-w-0 flex-1 pr-4">
        <p className="text-sm leading-relaxed text-foreground [&_b]:font-semibold">{item.title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{relativeTime(item.when)}</span>
          <span aria-hidden="true">·</span>
          <span>{item.module}</span>
          {item.urgent && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-destructive-text">Needs attention</span>
            </>
          )}
        </p>

        {item.quote && (
          <blockquote className="mt-2.5 line-clamp-3 rounded-xl squircle bg-subtle px-3.5 py-3 text-sm leading-relaxed text-foreground/80">
            {item.quote}
          </blockquote>
        )}
        {item.amount && <AmountCard amount={item.amount} />}
        {item.tags?.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <Badge key={t} tone="slate">{t}</Badge>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ActionButton primary onClick={() => onOpen(item)}>{item.primary.label}</ActionButton>
          {archived ? (
            <ActionButton onClick={() => onArchive(item.id, false)}>Restore</ActionButton>
          ) : (
            <ActionButton onClick={() => onArchive(item.id, true)}>Archive</ActionButton>
          )}
        </div>
      </div>

      {!archived && (
        <button
          type="button"
          onClick={() => onToggleRead(item.id)}
          aria-label={read ? "Mark as unread" : "Mark as read"}
          title={read ? "Mark as unread" : "Mark as read"}
          className="absolute right-5 top-5 grid h-4 w-4 place-items-center"
        >
          <span className={cn("h-2 w-2 rounded-full transition-colors", read ? "bg-transparent ring-1 ring-border" : "bg-primary")} />
        </button>
      )}
    </li>
  )
}

function LineTab({ active, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative -mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors",
        active ? "border-primary font-semibold text-primary" : "border-transparent font-medium text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-4 tabular",
          active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  )
}

// ---- Bell + drawer ----------------------------------------------------------

// Top-nav notifications: a bell that opens a right-side drawer (Minimal-style
// inbox) driven by real signals — new enquiries, due/overdue follow-ups,
// expiring quotations, overdue invoices and recent payments.
export function NotificationsDrawer() {
  const { data } = useCollections(["enquiries", "leads", "quotations", "invoices", "payments"])
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState("all")
  const [flags, setFlags] = useState(loadFlags)

  useEffect(() => saveFlags(flags), [flags])

  const feed = useMemo(() => buildFeed(data), [data])
  const isRead = (id) => Boolean(flags[id]?.read)
  const isArchived = (id) => Boolean(flags[id]?.archived)

  const active = feed.filter((n) => !isArchived(n.id))
  const unread = active.filter((n) => !isRead(n.id))
  const archived = feed.filter((n) => isArchived(n.id))
  const visible = tab === "unread" ? unread : tab === "archived" ? archived : active

  const update = useCallback((id, patch) => {
    setFlags((f) => ({ ...f, [id]: { ...(f[id] || {}), ...patch } }))
  }, [])

  const toggleRead = (id) => update(id, { read: !isRead(id) })
  const archive = (id, on) => update(id, { archived: on, read: true })
  const markAllRead = () => {
    setFlags((f) => {
      const next = { ...f }
      for (const n of active) next[n.id] = { ...(next[n.id] || {}), read: true }
      return next
    })
  }
  const go = (to) => {
    setOpen(false)
    navigate(to)
  }
  const openItem = (item) => {
    update(item.id, { read: true })
    go(item.primary.to)
  }

  const count = unread.length

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Notifications${count ? ` (${count} unread)` : ""}`}
        aria-expanded={open}
        className="relative grid h-[38px] w-[38px] place-items-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
      >
        <Bell variant="Linear" className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width="max-w-md"
        bodyClassName="p-0"
        title={
          <div className="flex items-center gap-1">
            <h2 className="mr-2 text-xl font-semibold text-foreground">Notifications</h2>
            <button
              type="button"
              onClick={markAllRead}
              disabled={count === 0}
              aria-label="Mark all as read"
              title="Mark all as read"
              className="grid h-8 w-8 place-items-center rounded-full text-primary transition-colors hover:bg-primary/10 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <CheckCircle2 className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => go("/settings")}
              aria-label="Notification settings"
              title="Notification settings"
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"
            >
              <Settings className="h-[18px] w-[18px]" />
            </button>
          </div>
        }
        footer={
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => go("/insights?tab=events")}
            className="w-full"
          >
            View all activity
          </Button>
        }
      >
        {/* Full-bleed rows: the drawer body is unpadded (bodyClassName="p-0") so
            the tab strip can stick flush to the top of the scroll area. */}
        <div>
          <div className="sticky top-0 z-10 border-b border-border bg-card px-5">
            <div className="flex items-center gap-1">
              <LineTab active={tab === "all"} label="All" count={active.length} onClick={() => setTab("all")} />
              <LineTab active={tab === "unread"} label="Unread" count={unread.length} onClick={() => setTab("unread")} />
              <LineTab active={tab === "archived"} label="Archived" count={archived.length} onClick={() => setTab("archived")} />
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-16 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-subtle text-muted-foreground">
                <Inbox className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {tab === "archived" ? "Nothing archived" : tab === "unread" ? "No unread notifications" : "You're all caught up"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tab === "archived"
                  ? "Archived notifications will show up here."
                  : "New enquiries, follow-ups, expiring quotes and invoice reminders land here."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((n) => (
                <NotificationRow
                  key={n.id}
                  item={n}
                  read={isRead(n.id)}
                  archived={tab === "archived"}
                  onOpen={openItem}
                  onToggleRead={toggleRead}
                  onArchive={archive}
                />
              ))}
            </ul>
          )}
        </div>
      </Drawer>
    </>
  )
}
