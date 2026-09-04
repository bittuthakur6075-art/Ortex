import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Sparkles,
  Users,
} from "../components/ui/Icons"
import { repo } from "../data/store/repository"
import { useCollection } from "../hooks/useCollection"
import { ENQUIRY_STATUS, newLine } from "../data/domain/schema"
import { relativeTime, formatDateTime } from "../lib/format"
import { exportCsv } from "../lib/csv"
import { cn } from "../lib/cn"
import PageHeader from "../components/layout/PageHeader"
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Drawer,
  EmptyState,
  Input,
  PageLoader,
  Select,
  StatCard,
  StatusBadge,
} from "../components/ui/Ui"

// Leads captured by Anu, the website AI voice assistant. They live in the shared
// `enquiries` collection tagged with this source (see Ortex.Web LiveOrty
// saveVoiceLead), so this page is a focused view over that one slice.
//
// The important wrinkle: Anu calls `capture_lead` every time the picture firms
// up during a call, and each call is a separate INSERT. One three-minute
// conversation therefore lands as three rows with three references, each a
// slightly better version of the last. Showing them as three leads (which is
// what the raw list did) triple-counts the pipeline and invites three people to
// ring the same customer. So rows are folded into CALLS here: same phone, gap
// under SESSION_GAP_MS. The newest row in a call is the truth; the earlier ones
// become its timeline.
const VOICE_SOURCE = "Voice assistant (Anu)"

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const SESSION_GAP_MS = 45 * MINUTE_MS

const RANGES = [
  { key: "all", label: "All time", days: null },
  { key: "1", label: "Today", days: 1 },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
]

// Anu is told to route complaints and order problems to a human, but she still
// saves them through the same tool, so they arrive looking exactly like buying
// intent. Pitching a quotation at someone trying to cancel is the worst outcome
// this page can produce, so those calls get flagged and can be filtered out.
const SUPPORT_RE =
  /\b(cancel|cancell?ation|complain|complaint|refund|return|bad behaviou?r|rude|angry|upset|not happy|dissatisf|poor service|damaged|defect|wrong (item|product|order)|delay(ed)? (order|delivery)|escalat)/i

// Callers routinely quote a quantity the mouth runs away with ("2 crore", with a
// 200 rupee budget in the same breath). Treated as real these dominate every
// sort and every total, so they are flagged for a human to confirm rather than
// silently trusted or silently dropped.
const BIG_QTY_RE = /\bcrore\b|\bkarod\b/i
const LAKH_RE = /(\d+(?:\.\d+)?)\s*(lakh|lac|lakhs)/i

// A name is only useful if someone can open a call with it. Anu falls back to
// filler when the customer never gives one, and `validateLead` on the website
// only checks for two letters, so these come through as real names.
const PLACEHOLDER_NAMES = new Set([
  "customer", "grahak", "sir", "madam", "unknown", "caller", "test", "testing",
  "na", "n/a", "none", "anonymous", "user", "client", "aap", "ji",
])

const URGENT_RE = /\b(urgent|urgently|asap|immediate|immediately|jaldi|turant|emergency|same day|tomorrow|kal chahiye)/i

// ---- parsing ---------------------------------------------------------------

// The website packs summary, quantity and timeline into one `message` string
// ("summary · Qty: x · Timeline: y") because `enquiries` has no columns for
// them. Split them back out so each reads as its own field. Rows saved before
// those suffixes existed come back as a summary with both fields empty, which is
// exactly right.
function parseMessage(message = "") {
  let quantity = ""
  let timeline = ""
  let itemsLine = ""
  const rest = []
  for (const part of String(message).split(" · ")) {
    const p = part.trim()
    if (/^qty:/i.test(p)) quantity = p.replace(/^qty:\s*/i, "")
    else if (/^timeline:/i.test(p)) timeline = p.replace(/^timeline:\s*/i, "")
    else if (/^items:/i.test(p)) itemsLine = p.replace(/^items:\s*/i, "")
    else if (p) rest.push(p)
  }
  return { summary: rest.join(" · "), quantity, timeline, itemsLine }
}

// An order is a list of products, one per thing the customer agreed to, including
// every cross-sell they accepted mid-call. Newer leads carry a structured
// `items` array. Older ones carry only the flat `productInterest` string plus a
// single quantity, so rebuild a one-line list from those rather than showing
// nothing. The "Items: 1000 x Diaries; 500 x Pens" digest is the last fallback,
// for a row whose array was lost but whose message survived.
function itemsFor(row) {
  const structured = (Array.isArray(row.items) ? row.items : [])
    .map((it) => ({
      product: String(it?.product || "").trim(),
      quantity: String(it?.quantity || "").trim(),
      notes: String(it?.notes || "").trim(),
    }))
    .filter((it) => it.product)
  if (structured.length) return structured

  if (row.itemsLine) {
    return row.itemsLine
      .split(";")
      .map((chunk) => {
        const m = chunk.trim().match(/^(.*?)\s+x\s+(.*)$/i)
        return m ? { product: m[2].trim(), quantity: m[1].trim(), notes: "" } : { product: chunk.trim(), quantity: "", notes: "" }
      })
      .filter((it) => it.product)
  }

  // `productInterest` is comma-joined when several products were captured, so a
  // legacy multi-product row still splits into a list. The single quantity we
  // have can only be attributed when there is exactly one product.
  const names = String(row.productInterest || "").split(",").map((s) => s.trim()).filter(Boolean)
  if (!names.length) return []
  return names.map((product) => ({
    product,
    quantity: names.length === 1 ? row.quantity || "" : "",
    notes: "",
  }))
}

// Spoken quantities are prose, not numbers: "1000", "90 lakhs total", "2 crore",
// "Not specified, assuming MOQ". Pull out a usable integer where one exists so a
// quotation line can be seeded, and return null when it genuinely is not a
// number so nothing is invented.
function parseQuantity(text = "") {
  const t = String(text)
  if (!t.trim()) return null
  const lakh = t.match(LAKH_RE)
  if (lakh) return Math.round(Number(lakh[1]) * 100000)
  const crore = t.match(/(\d+(?:\.\d+)?)\s*(crore|karod)/i)
  if (crore) return Math.round(Number(crore[1]) * 10000000)
  const plain = t.replace(/,/g, "").match(/\b(\d{1,9})\b/)
  return plain ? Number(plain[1]) : null
}

// Digits only, so the same caller is recognised whether Anu stored 10 digits,
// a leading zero, or a country code.
function phoneKey(phone = "") {
  const d = String(phone).replace(/\D/g, "")
  return d.length > 10 ? d.slice(-10) : d
}

// wa.me needs a full international number, but leads are normalised to a bare
// 10-digit Indian mobile before saving, so add the country code.
function waNumber(phone = "") {
  const d = String(phone).replace(/\D/g, "")
  if (d.length === 10) return `91${d}`
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`
  return d
}

function prettyPhone(phone = "") {
  const ten = phoneKey(phone)
  return ten.length === 10 ? `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` : phone || ""
}

function displayName(raw = "") {
  const name = String(raw).trim()
  if (!name) return { name: "Unnamed caller", named: false }
  if (PLACEHOLDER_NAMES.has(name.toLowerCase())) return { name: "Unnamed caller", named: false }
  return { name, named: true }
}

// Fold every row of a call into the flags that decide how it is presented and
// sorted. Deliberately conservative: these are hints for a human, never a
// classification the page acts on by itself.
function flagsFor(call) {
  const haystack = call.rows.map((r) => `${r.summary} ${r.quantity} ${r.timeline} ${r.productInterest}`).join(" ")
  const biggest = Math.max(0, ...call.itemsList.map((i) => parseQuantity(i.quantity) || 0), parseQuantity(call.quantity) || 0)
  // An item with no quantity cannot be priced, so the call is not yet quotable
  // even though it looks complete at a glance.
  const missingQty = call.itemsList.some((i) => !i.quantity)
  return {
    support: SUPPORT_RE.test(haystack),
    urgent: URGENT_RE.test(haystack) || URGENT_RE.test(call.timeline || ""),
    hugeQty: BIG_QTY_RE.test(haystack) || (LAKH_RE.test(haystack) && biggest >= 1000000),
    incomplete: !call.itemsList.length || missingQty,
  }
}

// ---- grouping --------------------------------------------------------------

// rows (newest first) -> calls (newest first). Within a call the newest row wins
// every field, but an older row fills a gap the customer mentioned early and Anu
// dropped from a later capture, so nothing said on the call is lost.
function groupIntoCalls(rows) {
  const byPhone = new Map()
  for (const r of rows) {
    const key = phoneKey(r.customer?.phone) || `anon:${r.id}`
    if (!byPhone.has(key)) byPhone.set(key, [])
    byPhone.get(key).push(r)
  }

  const calls = []
  for (const [key, list] of byPhone) {
    // list is newest first; walk it and cut a new call whenever the gap widens.
    let bucket = []
    const flush = () => {
      if (!bucket.length) return
      const newest = bucket[0]
      const oldest = bucket[bucket.length - 1]
      // Newest non-empty value across the call, newest row first.
      const pick = (get) => bucket.map(get).map((v) => (v || "").trim()).find(Boolean) || ""
      calls.push({
        id: newest.id,
        phoneKey: key,
        rows: bucket,
        captures: bucket.length,
        startedAt: oldest.createdAt,
        endedAt: newest.createdAt,
        status: newest.status || "new",
        reference: newest.reference,
        customer: {
          name: pick((r) => r.customer?.name),
          phone: pick((r) => r.customer?.phone),
          email: pick((r) => r.customer?.email),
          company: pick((r) => r.customer?.company),
          address: pick((r) => r.customer?.address),
        },
        // Newest capture that listed any item wins outright, rather than merging
        // across captures. Anu is instructed to re-send the complete order every
        // time, so the latest list is the order as it actually stands, and an
        // item the customer dropped mid-call stays dropped. Every capture's own
        // list still shows in the call timeline, so nothing becomes invisible.
        itemsList: bucket.map((r) => r.itemsList).find((l) => l && l.length) || [],
        productInterest: pick((r) => r.productInterest),
        quantity: pick((r) => r.quantity),
        timeline: pick((r) => r.timeline),
        summary: pick((r) => r.summary),
      })
      bucket = []
    }
    for (const r of list) {
      if (!bucket.length) { bucket = [r]; continue }
      const prev = bucket[bucket.length - 1]
      const gap = new Date(prev.createdAt).getTime() - new Date(r.createdAt).getTime()
      if (gap <= SESSION_GAP_MS) bucket.push(r)
      else { flush(); bucket = [r] }
    }
    flush()
  }

  calls.sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))

  // Number each caller's calls once the full set is known, so "Call 2 of 3"
  // means the second time this person rang, not the second capture in one call.
  const totals = new Map()
  for (const c of calls) totals.set(c.phoneKey, (totals.get(c.phoneKey) || 0) + 1)
  const seen = new Map()
  for (let i = calls.length - 1; i >= 0; i--) {
    const n = (seen.get(calls[i].phoneKey) || 0) + 1
    seen.set(calls[i].phoneKey, n)
    calls[i].callIndex = n
    calls[i].callTotal = totals.get(calls[i].phoneKey)
  }
  return calls
}

// ---- small presentational pieces -------------------------------------------

function Detail({ icon: Icon, label, value, className }) {
  if (!value) return null
  return (
    <div className={cn("flex gap-2.5 text-sm", className)}>
      <Icon className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" />
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
    </div>
  )
}

// The order itself. A cross-sell the customer accepted is a line on this list,
// not a footnote in the summary, so every item gets its own row with its own
// quantity and a visible gap where a quantity is still missing.
function ItemsList({ items, dense = false }) {
  if (!items.length) {
    return (
      <div className="flex gap-2.5 text-sm text-muted-foreground">
        <Package className="mt-0.5 h-4 w-4 flex-none" />
        <span>No product captured on this call</span>
      </div>
    )
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Package className="h-3.5 w-3.5" />
        {items.length === 1 ? "Product" : `Order, ${items.length} items`}
      </div>
      <ul className={cn("space-y-1", dense && "space-y-0.5")}>
        {items.map((it, i) => (
          <li key={`${it.product}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1 font-medium text-foreground">
              {it.product}
              {it.notes && <span className="ml-1 font-normal text-muted-foreground">({it.notes})</span>}
            </span>
            {it.quantity ? (
              <span className="tabular flex-none font-semibold text-foreground">{it.quantity}</span>
            ) : (
              <span className="flex-none text-xs font-medium text-amber-600">Qty missing</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ContactRow({ call, size = "md" }) {
  const phone = call.customer.phone
  if (!phone) {
    return (
      <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        No number captured, this lead cannot be called back
      </div>
    )
  }
  const wa = waNumber(phone)
  const pad = size === "sm" ? "px-3 py-1.5 text-xs" : "px-3 py-2 text-sm"
  return (
    <div className="flex gap-2">
      <a
        href={`https://wa.me/${wa}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`Message ${call.customer.name || "caller"} on WhatsApp`}
        className={cn(
          "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/12 font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/20",
          pad,
        )}
      >
        <MessageCircle className="h-4 w-4" /> WhatsApp
      </a>
      <a
        href={`tel:+${wa}`}
        aria-label={`Call ${call.customer.name || "caller"}`}
        className={cn(
          "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-muted font-semibold text-foreground transition-colors hover:bg-muted/70",
          pad,
        )}
      >
        <Phone className="h-4 w-4" /> {prettyPhone(phone)}
      </a>
    </div>
  )
}

function CallBadges({ call, flags }) {
  const fresh = Date.now() - new Date(call.endedAt).getTime() <= DAY_MS
  return (
    <>
      {flags.support && (
        <Badge tone="rose">
          <AlertTriangle className="h-3 w-3" /> Support issue
        </Badge>
      )}
      {flags.urgent && !flags.support && (
        <Badge tone="amber">
          <Clock className="h-3 w-3" /> Urgent
        </Badge>
      )}
      {fresh && <Badge tone="emerald">New</Badge>}
      {call.callTotal > 1 && (
        <Badge tone="violet">
          Call {call.callIndex} of {call.callTotal}
        </Badge>
      )}
      {flags.hugeQty && <Badge tone="amber">Verify quantity</Badge>}
    </>
  )
}

// ---- page ------------------------------------------------------------------

export default function VoiceLeads() {
  const { items, loading } = useCollection("enquiries")
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [range, setRange] = useState("all")
  const [view, setView] = useState("all") // all | attention | support
  const [open, setOpen] = useState(null) // phoneKey+endedAt of the expanded call
  const [saving, setSaving] = useState(false)

  const calls = useMemo(() => {
    const rows = (items || [])
      .filter((e) => e.source === VOICE_SOURCE)
      .map((e) => {
        const parsed = { ...e, ...parseMessage(e.message) }
        return { ...parsed, itemsList: itemsFor(parsed) }
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return groupIntoCalls(rows).map((c) => ({ ...c, flags: flagsFor(c), ...displayName(c.customer.name) }))
  }, [items])

  const stats = useMemo(() => {
    const now = Date.now()
    const products = new Map()
    const callers = new Set()
    let week = 0
    let support = 0
    for (const c of calls) {
      callers.add(c.phoneKey)
      if (now - new Date(c.endedAt).getTime() <= 7 * DAY_MS) week += 1
      if (c.flags.support) support += 1
      const p = c.productInterest.trim()
      if (p) products.set(p, (products.get(p) || 0) + 1)
    }
    const top = [...products.entries()].sort((a, b) => b[1] - a[1])[0]
    const repeat = calls.length - callers.size
    return {
      calls: calls.length,
      callers: callers.size,
      repeat,
      week,
      support,
      topProduct: top?.[0] || "",
      topCount: top?.[1] || 0,
    }
  }, [calls])

  const visible = useMemo(() => {
    let rows = calls
    if (view === "support") rows = rows.filter((c) => c.flags.support)
    else if (view === "attention") rows = rows.filter((c) => c.status === "new" && !c.flags.support)

    const days = RANGES.find((r) => r.key === range)?.days
    if (days) {
      const cutoff = Date.now() - days * DAY_MS
      rows = rows.filter((c) => new Date(c.endedAt).getTime() >= cutoff)
    }

    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter((c) =>
        [
          c.name, c.customer.phone, c.customer.company, c.customer.address, c.customer.email,
          c.productInterest, c.quantity, c.timeline, c.summary,
          ...c.itemsList.map((i) => `${i.product} ${i.quantity} ${i.notes}`),
          ...c.rows.map((r) => r.reference),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    }
    return rows
  }, [calls, query, range, view])

  const active = open ? visible.find((c) => c.id === open) || calls.find((c) => c.id === open) || null : null

  // Status lives on the underlying enquiry rows. A call can span several rows,
  // so move all of them together, otherwise the fold would keep showing the
  // newest row's status while older siblings disagree in the Enquiries list.
  const setStatus = async (call, status) => {
    setSaving(true)
    try {
      await Promise.all(call.rows.map((r) => repo.update("enquiries", r.id, { status })))
      toast.success(`Marked ${ENQUIRY_STATUS.find((s) => s.id === status)?.label || status}`)
    } catch {
      toast.error("Could not update the status. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  // Hand the call to the quotation editor pre-filled. The product and quantity
  // Anu captured seed the first line; the rate is left at zero because a voice
  // call never produces a price worth trusting.
  const toQuotation = (call) => {
    // One quotation line per item, so an order the customer grew during the call
    // arrives as the order they actually agreed to, cross-sells included.
    const lines = call.itemsList.length
      ? call.itemsList.map((it) => {
          const n = parseQuantity(it.quantity)
          return newLine({
            description: [it.product, it.notes].filter(Boolean).join(", "),
            quantity: n && n > 0 ? n : 1,
          })
        })
      : [newLine({ description: call.productInterest || "", quantity: parseQuantity(call.quantity) || 1 })]

    const context = [
      call.summary,
      call.timeline ? `Timeline: ${call.timeline}` : "",
      `Captured by Anu on ${formatDateTime(call.endedAt)} (${call.reference})`,
    ].filter(Boolean).join(" · ")

    navigate("/quotations", {
      state: {
        fromEnquiry: {
          id: call.rows[0].id,
          customer: {
            name: call.named ? call.customer.name : "",
            company: call.customer.company,
            email: call.customer.email,
            phone: call.customer.phone,
            address: call.customer.address,
          },
          lines,
          message: context,
        },
      },
    })
  }

  const handleExport = () => {
    exportCsv(
      `ortex-voice-leads-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Name", value: (c) => (c.named ? c.customer.name : "") },
        { header: "Phone", value: (c) => prettyPhone(c.customer.phone) },
        { header: "Company", value: (c) => c.customer.company },
        { header: "Address", value: (c) => c.customer.address },
        { header: "Items", value: (c) => c.itemsList.length },
        {
          header: "Order",
          value: (c) => c.itemsList.map((i) => [i.quantity, i.product].filter(Boolean).join(" x ")).join("; "),
        },
        { header: "Timeline", value: (c) => c.timeline },
        { header: "Summary", value: (c) => c.summary },
        { header: "Status", value: (c) => c.status },
        { header: "Call", value: (c) => `${c.callIndex} of ${c.callTotal}` },
        { header: "Captures", value: (c) => c.captures },
        { header: "Called at", value: (c) => formatDateTime(c.endedAt) },
        { header: "Reference", value: (c) => c.reference },
        { header: "Flags", value: (c) => Object.entries(c.flags).filter(([, v]) => v).map(([k]) => k).join(" ") },
      ],
      visible,
    )
  }

  if (loading) return <PageLoader />

  const filtering = Boolean(query.trim()) || range !== "all" || view !== "all"

  return (
    <div>
      <PageHeader
        title="Voice Leads"
        subtitle={
          stats.calls
            ? `${stats.calls} call${stats.calls === 1 ? "" : "s"} from ${stats.callers} caller${stats.callers === 1 ? "" : "s"}, captured by Anu`
            : "Captured by Anu, the AI voice assistant"
        }
      >
        {stats.calls > 0 && (
          <Button variant="ghost" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" /> Export
          </Button>
        )}
      </PageHeader>

      {stats.calls > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Users}
            label="Callers"
            value={stats.callers}
            sub={stats.repeat ? `${stats.repeat} called back` : "No repeat calls yet"}
          />
          <StatCard
            icon={CalendarClock}
            label="Last 7 days"
            value={stats.week}
            sub={stats.week ? "Freshest intent, call these first" : "Nothing new this week"}
            accent="bg-emerald-500/14 text-emerald-600"
          />
          <StatCard
            icon={AlertTriangle}
            label="Support issues"
            value={stats.support}
            sub={stats.support ? "Route to support, do not pitch" : "None flagged"}
            accent={stats.support ? "bg-rose-500/12 text-rose-600" : "bg-slate-500/12 text-slate-500"}
          />
          <StatCard
            icon={Package}
            label="Most asked"
            value={
              <span className="block truncate text-lg" title={stats.topProduct}>
                {stats.topProduct || "Not captured"}
              </span>
            }
            sub={stats.topCount ? `${stats.topCount} call${stats.topCount === 1 ? "" : "s"}` : ""}
            accent="bg-amber-500/14 text-amber-600"
          />
        </div>
      )}

      {stats.calls > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="w-full max-w-sm">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone, product, city, requirement…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={view === "all"} onClick={() => setView("all")}>All</Chip>
            <Chip active={view === "attention"} onClick={() => setView("attention")}>Needs follow-up</Chip>
            <Chip active={view === "support"} onClick={() => setView("support")}>
              Support {stats.support > 0 && `(${stats.support})`}
            </Chip>
            <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
            {RANGES.map((r) => (
              <Chip key={r.key} active={range === r.key} onClick={() => setRange(r.key)}>
                {r.label}
              </Chip>
            ))}
          </div>
          {filtering && (
            <span className="text-sm text-muted-foreground">
              {visible.length} of {stats.calls} shown
            </span>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={filtering ? "No calls match this filter" : "No voice leads yet"}
          description={
            filtering
              ? "Try a different search term, another view, or a wider date range."
              : "When Anu captures a customer's details on the website, the summarised call appears here."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((call) => {
            const f = call.flags
            const hasDetail =
              call.itemsList.length || call.timeline || call.customer.address || call.customer.company
            return (
              <Card
                key={call.id}
                className={cn(
                  "flex flex-col p-5 ring-1 transition-shadow hover:shadow-md",
                  f.support ? "ring-rose-500/30" : "ring-border/60",
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar name={call.named ? call.name : "?"} className={f.support ? "bg-rose-500/10 text-rose-600" : ""} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn("truncate font-semibold", call.named ? "text-foreground" : "text-muted-foreground")}>
                        {call.name}
                      </span>
                      <StatusBadge list={ENQUIRY_STATUS} status={call.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <CallBadges call={call} flags={f} />
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      {relativeTime(call.endedAt)}
                      {call.captures > 1 && ` · ${call.captures} updates during the call`}
                    </div>
                  </div>
                </div>

                {hasDetail && (
                  <div className="mt-4 space-y-2.5 rounded-lg bg-muted/40 p-3">
                    <ItemsList items={call.itemsList} dense />
                    {(call.timeline || call.customer.company || call.customer.address) && (
                      <div className="space-y-2 border-t border-border/60 pt-2.5">
                        <Detail icon={CalendarClock} label="Timeline" value={call.timeline} />
                        <Detail icon={Building2} label="Company" value={call.customer.company} />
                        <Detail icon={MapPin} label="Deliver to" value={call.customer.address} />
                      </div>
                    )}
                  </div>
                )}

                {call.summary && (
                  <p className="mt-3 flex-1 line-clamp-4 text-sm leading-relaxed text-muted-foreground">{call.summary}</p>
                )}

                <div className="mt-4 space-y-2">
                  <ContactRow call={call} />
                  <button
                    onClick={() => setOpen(call.id)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    Open call
                  </button>
                </div>

                <div className="mt-4 border-t border-border pt-2.5 text-xs text-muted-foreground">
                  {formatDateTime(call.endedAt)} · {call.reference}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Drawer
        open={Boolean(active)}
        onClose={() => setOpen(null)}
        title={active?.name || "Call"}
        subtitle={active ? `${formatDateTime(active.endedAt)} · Call ${active.callIndex} of ${active.callTotal}` : ""}
        width="max-w-xl"
        footer={
          active && (
            <div className="flex w-full flex-wrap items-center gap-2">
              <Select
                className="w-auto flex-1"
                value={active.status}
                disabled={saving}
                onChange={(e) => setStatus(active, e.target.value)}
              >
                {ENQUIRY_STATUS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
              <Button onClick={() => toQuotation(active)}>
                <FileText className="h-4 w-4" /> Create quotation
              </Button>
            </div>
          )
        }
      >
        {active && (
          <div className="space-y-5">
            {active.flags.support && (
              <div className="flex gap-2.5 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <p>
                  This call mentions a complaint or cancellation. Handle it as support before any sales follow-up, a
                  quotation here will read as tone deaf.
                </p>
              </div>
            )}

            {!active.named && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                Anu never captured a name on this call. Open with the number and the requirement instead.
              </div>
            )}

            <ContactRow call={active} />

            <div className="space-y-3 rounded-lg bg-muted/40 p-4">
              <ItemsList items={active.itemsList} />
              <div className="space-y-2 border-t border-border/60 pt-3">
                <Detail icon={CalendarClock} label="Timeline" value={active.timeline} />
                <Detail icon={Building2} label="Company" value={active.customer.company} />
                <Detail icon={Mail} label="Email" value={active.customer.email} />
                <Detail icon={MapPin} label="Deliver to" value={active.customer.address} />
                {!active.customer.address && (
                  <div className="flex gap-2.5 text-sm text-amber-600">
                    <MapPin className="mt-0.5 h-4 w-4 flex-none" />
                    <span>Delivery city not captured. Ask for it before quoting freight.</span>
                  </div>
                )}
              </div>
            </div>

            {active.flags.incomplete && active.itemsList.length > 0 && (
              <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                One or more items have no quantity. Confirm them before quoting, a line without a quantity cannot be
                priced.
              </div>
            )}

            {active.flags.hugeQty && (
              <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                The quantity on this call is unusually large. Confirm it before it is used for pricing, spoken figures
                like this are often a slip of the tongue.
              </div>
            )}

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What Anu heard
                {active.captures > 1 && ` · ${active.captures} updates`}
              </h3>
              {/* Newest first: Anu re-saves as the picture firms up, so the last
                  entry is the one that reflects how the call actually ended. */}
              <ol className="space-y-3">
                {active.rows.map((r, i) => (
                  <li key={r.id} className="relative border-l border-border pl-4">
                    <span
                      className={cn(
                        "absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full",
                        i === 0 ? "bg-primary" : "bg-border",
                      )}
                    />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDateTime(r.createdAt)}</span>
                      {i === 0 && active.rows.length > 1 && <Badge tone="blue">Final</Badge>}
                      <span className="tabular">{r.reference}</span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                      {r.summary || "No summary recorded for this update."}
                    </p>
                    {/* What this capture actually held, so a product added or
                        dropped between captures is visible rather than implied. */}
                    {r.itemsList.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.itemsList.map((i) => [i.quantity, i.product].filter(Boolean).join(" x ")).join(" · ")}
                      </p>
                    )}
                    {r.timeline && <p className="mt-0.5 text-xs text-muted-foreground">Timeline: {r.timeline}</p>}
                  </li>
                ))}
              </ol>
            </div>

            {active.callTotal > 1 && (
              <div className="flex gap-2.5 rounded-lg bg-violet-500/10 p-3 text-sm text-violet-700 dark:text-violet-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />
                <p>
                  This customer has called {active.callTotal} times. Repeat callers convert far better than first-time
                  ones, so treat this as a warm lead.
                </p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
