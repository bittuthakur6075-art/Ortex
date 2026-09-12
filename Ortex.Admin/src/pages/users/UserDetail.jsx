import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Avatar, Badge, Banner, Button, EmptyState, PageLoader } from "../../components/ui/Ui"
import { EditorHeader, Section, Tile, Tiles } from "../../components/editors/DocumentEditorShell"
import { Clock, FileText, Pencil, ShieldCheck, Users as UsersIcon } from "../../components/ui/Icons"
import { formatDateTime, relativeTime } from "../../lib/format"
import { moduleLabel, roleLabel } from "../../lib/roles"
import { currentUserId } from "../../lib/auth"
import { getProfile } from "../../services/users"
import { useActorHistory } from "../../hooks/useActorHistory"
import RowActions from "./RowActions"
import UserEditor from "./UserEditor"

// One console account, end to end: who they are, what they can reach, and
// every audited thing they have done.
//
// The audit trail (migration 0023) is already keyed on the actor
// (audit_log_actor_idx), so this is the same data the per-record Activity card
// shows, asked the other way round: not "what happened to this quotation" but
// "what has this person been doing". That is the question an admin actually has
// when they open somebody's row — before changing their access, or after
// something in the data looks wrong.

// audit_log stores the table name. These are the words people use for them, and
// the route to open the record where one exists. Quotations, invoices and the
// rest are edited inside their list pages rather than at their own URL, so only
// the two collections with a real detail route are linked; the others are named
// and left alone rather than pointed at a page that would 404.
const COLLECTIONS = {
  products: { label: "Product" },
  categories: { label: "Category" },
  customers: { label: "Customer", route: (id) => `/customers/${id}` },
  enquiries: { label: "Enquiry", route: (id) => `/enquiries/${id}` },
  leads: { label: "Lead" },
  quotations: { label: "Quotation" },
  invoices: { label: "Invoice" },
  payments: { label: "Payment" },
  work: { label: "Work photo" },
  social: { label: "Social post" },
  automation_rules: { label: "Automation rule" },
  message_templates: { label: "Message template" },
  telecaller_jobs: { label: "Telecaller job" },
}

const ACTION_TONE = { insert: "emerald", update: "blue", delete: "rose" }
const ACTION_VERB = { insert: "Created", update: "Edited", delete: "Deleted" }

const collectionLabel = (name) => COLLECTIONS[name]?.label || name

// A change is listed by the fields that moved, so "what did they do to it" is
// answerable without opening the record. Names only — the per-record Activity
// card carries the from/to values, and repeating them here would turn a day's
// work into a wall of JSON.
function changedFields(entry) {
  if (entry.action !== "update") return []
  return Object.keys(entry.changes || {})
    .map((k) => k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase())
    .slice(0, 8)
}

function Entry({ entry, isLast }) {
  const meta = COLLECTIONS[entry.collection]
  const fields = changedFields(entry)
  // The label is resolved at write time and kept, so a deleted record still
  // says what it was. A row that never had one (no number, no name) is shown by
  // its collection alone rather than as a bare uuid.
  const name = entry.label || collectionLabel(entry.collection)
  const href = entry.action !== "delete" && meta?.route ? meta.route(entry.recordId) : null

  return (
    <li className="relative pl-6 pb-4 last:pb-0">
      <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-subtle-foreground" aria-hidden="true" />
      {!isLast && <span className="absolute bottom-0 left-[3px] top-4 w-px bg-border" aria-hidden="true" />}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <Badge tone={ACTION_TONE[entry.action] || "slate"}>{ACTION_VERB[entry.action] || entry.action}</Badge>
        <span className="text-muted-foreground">{collectionLabel(entry.collection).toLowerCase()}</span>
        {href ? (
          <Link to={href} className="font-medium text-primary hover:underline">{name}</Link>
        ) : (
          <span className="font-medium text-foreground">{name}</span>
        )}
        <span className="text-subtle-foreground" title={formatDateTime(entry.at)}>
          · {formatDateTime(entry.at)} ({relativeTime(entry.at)})
        </span>
      </div>

      {fields.length > 0 && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          Changed <span className="text-foreground">{fields.join(", ")}</span>
        </p>
      )}
    </li>
  )
}

const PAGE = 25

export default function UserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const selfId = currentUserId()
  const [user, setUser] = useState(undefined) // undefined = loading, null = gone
  const [editing, setEditing] = useState(false)
  const [visible, setVisible] = useState(PAGE)
  const { entries, loading: loadingActivity, error: activityError } = useActorHistory(id)

  const load = useCallback(async () => {
    try {
      setUser(await getProfile(id))
    } catch (e) {
      toast.error(e.message || "Failed to load this user")
      setUser(null)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(() => {
    const c = { insert: 0, update: 0, delete: 0 }
    for (const e of entries) if (c[e.action] !== undefined) c[e.action] += 1
    return c
  }, [entries])

  if (user === undefined) return <PageLoader />

  if (!user) {
    return (
      <EmptyState
        icon={UsersIcon}
        title="That account no longer exists"
        description="It was deleted, or the link is out of date."
        action={<Button onClick={() => navigate("/users")}>Back to users</Button>}
      />
    )
  }

  const modules = user.role === "admin" ? [] : user.modules || []
  const shown = entries.slice(0, visible)

  return (
    <div>
      <EditorHeader
        onBack={() => navigate("/users")}
        backLabel="Back to users"
        title={user.name || user.email}
        trail={[user.email]}
        badge={<Badge tone={user.active ? "emerald" : "rose"}>{user.active ? "Active" : "Deactivated"}</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil variant="Linear" className="h-4 w-4" /> Edit role &amp; access
            </Button>
            <RowActions user={user} selfId={selfId} onEdit={() => setEditing(true)} onChanged={load} />
          </div>
        }
      />

      <Tiles>
        <Tile icon={ShieldCheck} label="Role" value={roleLabel(user.role)} sub={user.id === selfId ? "This is you" : undefined} />
        <Tile icon={FileText} label="Records created" value={counts.insert} tone="success" />
        <Tile icon={Pencil} label="Records edited" value={counts.update} tone="info" />
        <Tile
          icon={Clock}
          label="Last activity"
          value={entries[0] ? relativeTime(entries[0].at) : "None"}
          sub={entries[0] ? formatDateTime(entries[0].at) : "Nothing audited yet"}
          tone="slate"
        />
      </Tiles>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Section title="Account" description="Who this is and what they can reach." className="lg:col-span-1">
          <div className="flex items-center gap-3">
            <Avatar name={user.name || user.email} src={user.avatar_url} className="h-14 w-14 text-base" />
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{user.name || "No name set"}</div>
              <div className="truncate text-[13px] text-muted-foreground">{user.email}</div>
            </div>
          </div>

          <dl className="mt-5 space-y-3 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Role</dt>
              <dd><Badge tone={user.role === "admin" ? "violet" : "blue"}>{roleLabel(user.role)}</Badge></dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Sign-in</dt>
              <dd className="text-foreground">{user.active ? "Allowed" : "Blocked"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Added</dt>
              <dd className="text-foreground" title={user.created_at ? formatDateTime(user.created_at) : undefined}>
                {user.created_at ? formatDateTime(user.created_at) : "Not recorded"}
              </dd>
            </div>
          </dl>

          <div className="mt-5">
            <span className="text-xs font-semibold uppercase tracking-wide text-subtle-foreground">Module access</span>
            {user.role === "admin" ? (
              <p className="mt-2 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2.5 text-[13px] text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" /> Every module, by role.
              </p>
            ) : modules.length === 0 ? (
              // Not the same as "no access": the Dashboard is always granted, so
              // say what they can actually see rather than leaving a blank.
              <p className="mt-2 text-[13px] text-muted-foreground">No modules granted. They see the Dashboard only.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {modules.map((k) => (
                  <span key={k} className="rounded-btn bg-muted px-2 py-1 text-[12px] font-medium text-secondary-foreground">
                    {moduleLabel(k)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section
          title="Activity"
          description="Every audited create, edit and delete this account has made, newest first."
          className="lg:col-span-2"
        >
          {activityError ? (
            <Banner tone="danger">{activityError}</Banner>
          ) : loadingActivity ? (
            <p className="text-[13px] text-muted-foreground">Loading activity…</p>
          ) : entries.length === 0 ? (
            // Three different nothings, and only one of them means idle: the
            // audit trail starts at migration 0023, it deliberately skips the
            // machine-written tables (page views, event logs, WhatsApp sends),
            // and this person may simply not have edited anything yet.
            <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
              <Clock className="mt-0.5 h-4 w-4 flex-none text-subtle-foreground" />
              <span>
                Nothing audited for this account. Work done before the audit trail was switched on carries no record and
                cannot be reconstructed, and the high-volume machine-written tables (website visits, event logs, message
                sends) are deliberately not audited.
              </span>
            </p>
          ) : (
            <>
              <ul className="relative">
                {shown.map((e, i) => (
                  <Entry key={e.id} entry={e} isLast={i === shown.length - 1} />
                ))}
              </ul>
              {entries.length > visible && (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setVisible((v) => v + PAGE)}>
                  Show more ({entries.length - visible} older)
                </Button>
              )}
              {/* actorHistory caps the read, so say when the list is a window
                  rather than the whole story. */}
              {entries.length >= 200 && visible >= entries.length && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Showing the most recent 200 changes.
                </p>
              )}
            </>
          )}
        </Section>
      </div>

      {editing && (
        <UserEditor
          user={user}
          selfId={selfId}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            load()
          }}
        />
      )}
    </div>
  )
}
