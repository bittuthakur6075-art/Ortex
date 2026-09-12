import { useState } from "react"
import { Avatar, Badge, Button, Card, CardHeader } from "./Ui"
import { Clock } from "./Icons"
import { formatCurrency, formatDateTime, relativeTime } from "../../lib/format"
import { actorOf, useRecordHistory } from "../../hooks/useRecordHistory"

// Who made this record, who touched it last, and every change in between.
//
// Drops onto any detail page: <RecordActivity collection="quotations"
// record={quotation} />. The record supplies createdAt/updatedAt and the two
// actor uuids (apiStore maps them off the row); the history comes from
// audit_log via useRecordHistory.
//
// Reads as prose rather than a table because that is how somebody asks the
// question — "who changed the rate on this?" — and a grid of uuids and JSON
// answers a different one.

// doc keys are camelCase and several are meaningless on their own ("gstRate"
// reads as a variable, not a fact), so the ones that actually show up in a
// change get a human label. Anything unmapped falls back to a de-camelised
// version, which is right often enough to be worth not enumerating every key.
const FIELD_LABELS = {
  amount: "Amount",
  balance: "Balance",
  category: "Category",
  cost: "Cost price",
  customer: "Customer",
  description: "Description",
  discount: "Discount",
  dueDate: "Due date",
  gstRate: "GST rate",
  hsn: "HSN code",
  imageUrls: "Photos",
  items: "Line items",
  lines: "Line items",
  moq: "Minimum order qty",
  name: "Name",
  notes: "Notes",
  number: "Number",
  owner: "Owner",
  paidAt: "Paid on",
  placeOfSupply: "Place of supply",
  price: "Price",
  productInterest: "Product interest",
  quantity: "Quantity",
  rate: "Rate",
  reference: "Reference",
  showOnWebsite: "Website visibility",
  sku: "SKU",
  starred: "Starred",
  status: "Status",
  tally: "Tally sync",
  total: "Total",
  validUntil: "Valid until",
}

const MONEY_KEYS = new Set(["amount", "balance", "cost", "discount", "price", "rate", "total", "paid", "subtotal"])

function labelFor(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// A value out of a jsonb diff can be anything. Print the scalars people can
// actually read and summarise the rest by shape — "3 items" says more about a
// line-items change than 400 characters of JSON, and the full document is one
// click away on the page this card sits on.
function valueText(key, value) {
  if (value === null || value === undefined || value === "") return "empty"
  if (typeof value === "boolean") return value ? "yes" : "no"
  if (typeof value === "number") return MONEY_KEYS.has(key) ? formatCurrency(value) : String(value)
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "item" : "items"}`
  if (typeof value === "object") {
    const name = value.name || value.company || value.title
    return name ? String(name) : "details"
  }
  const s = String(value)
  if (s === "…") return "(too long to record)"
  return s.length > 80 ? `${s.slice(0, 80)}…` : s
}

const ACTION_TONE = { insert: "emerald", update: "blue", delete: "rose" }
const ACTION_VERB = { insert: "Created", update: "Edited", delete: "Deleted" }

function Person({ actor, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Avatar name={actor.name} src={actor.avatarUrl} className="h-5 w-5 text-[9px]" />
      <span className={actor.known ? "font-medium text-foreground" : "text-muted-foreground"}>{actor.name}</span>
    </span>
  )
}

// One line of the timeline. An insert lists nothing (the whole record IS the
// change); an update lists the fields that moved, each as from → to.
function Entry({ entry, directory, isLast }) {
  // A null actor inside a history entry is not a gap in the record: it is the
  // service role, which has no auth.uid(). That is the Tally connector, the
  // telecaller sweep or a website lead landing through an edge function.
  const actor = actorOf(entry.actor, directory, "Automation")
  const keys = entry.action === "update" ? Object.keys(entry.changes || {}) : []

  return (
    <li className="relative pl-6 pb-4 last:pb-0">
      <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-subtle-foreground" aria-hidden="true" />
      {/* The rail joins this entry to the next one, so the last entry has none
          — drawn conditionally rather than with `last:`, which would target the
          wrong element (this span is not its parent's last child). */}
      {!isLast && <span className="absolute bottom-0 left-[3px] top-4 w-px bg-border" aria-hidden="true" />}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <Badge tone={ACTION_TONE[entry.action] || "slate"}>{ACTION_VERB[entry.action] || entry.action}</Badge>
        <span className="text-muted-foreground">by</span>
        <Person actor={actor} />
        <span className="text-subtle-foreground" title={formatDateTime(entry.at)}>
          · {formatDateTime(entry.at)} ({relativeTime(entry.at)})
        </span>
      </div>

      {keys.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {keys.map((k) => (
            <li key={k} className="text-[13px] text-muted-foreground">
              <span className="font-medium text-foreground">{labelFor(k)}</span>{" "}
              <span className="line-through decoration-subtle-foreground">{valueText(k, entry.changes[k]?.from)}</span>
              {" → "}
              <span className="text-foreground">{valueText(k, entry.changes[k]?.to)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

const INITIAL_VISIBLE = 6

// `bare` drops the Card shell for callers that already own their surface — a
// Drawer body, or a page section that draws its own heading. The content is
// identical; only the chrome differs.
export function RecordActivity({ collection, record, className = "", title = "Activity", bare = false }) {
  const { entries, directory, loading } = useRecordHistory(collection, record?.id)
  const [expanded, setExpanded] = useState(false)

  if (!record) return null

  // The two actor columns on the row answer the headline question without
  // reading the log at all — and they survive even if the log is trimmed.
  // "Not recorded" is the honest reading of a null here: everything written
  // before migration 0023 has one, and it is not recoverable.
  const creator = actorOf(record.createdBy, directory, "Not recorded")
  const editor = actorOf(record.updatedBy, directory, "Not recorded")
  const edited = record.updatedAt && record.updatedAt !== record.createdAt

  const visible = expanded ? entries : entries.slice(0, INITIAL_VISIBLE)

  const body = (
    <>
        <dl className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">Created</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              <Person actor={creator} />
              {record.createdAt && (
                <span className="text-muted-foreground" title={formatDateTime(record.createdAt)}>
                  · {formatDateTime(record.createdAt)}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">Last modified</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              {edited ? (
                <>
                  <Person actor={editor} />
                  <span className="text-muted-foreground" title={formatDateTime(record.updatedAt)}>
                    · {formatDateTime(record.updatedAt)} ({relativeTime(record.updatedAt)})
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Never edited since it was created</span>
              )}
            </dd>
          </div>
        </dl>

        {loading ? (
          <p className="text-[13px] text-muted-foreground">Loading history…</p>
        ) : entries.length === 0 ? (
          // Two different nothings, and the distinction matters: a record made
          // before the audit trail existed has no history and never will, which
          // is not the same as one nobody has touched.
          <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <Clock className="mt-0.5 h-4 w-4 flex-none text-subtle-foreground" />
            <span>
              No change history. Records created before the audit trail was switched on carry none, and it cannot be
              reconstructed — every edit from now on is logged here.
            </span>
          </p>
        ) : (
          <>
            <ul className="relative">
              {visible.map((e, i) => (
                <Entry key={e.id} entry={e} directory={directory} isLast={i === visible.length - 1} />
              ))}
            </ul>
            {entries.length > INITIAL_VISIBLE && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Show less" : `Show all ${entries.length} changes`}
              </Button>
            )}
          </>
        )}
    </>
  )

  if (bare) {
    return (
      <div className={className}>
        {/* The caller's own section heading usually already says "Activity";
            passing title="" suppresses a second one. */}
        {title && <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>}
        {body}
      </div>
    )
  }

  return (
    <Card className={className}>
      <CardHeader title={title} description="Who touched this record, and when." />
      <div className="p-5">{body}</div>
    </Card>
  )
}
