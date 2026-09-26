import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Phone, ShieldCheck } from "../../components/ui/Icons"
import { summarizeDay } from "../../lib/attendance"
import { upcomingDeadlines, dueWords, shortDate } from "../../lib/payrollDeadlines"
import { monthWords, nextAction, thisMonthIST } from "../payroll/run/shared"
import { ROLES, roleLabel } from "../../lib/roles"
import { ACTION_VERB, collectionLabel } from "../../lib/auditWords"
import { relativeTime } from "../../lib/format"
import { cn } from "../../lib/cn"
import { Dot, Initials, Kicker, Panel, PanelLink, Pill, Row, Rows, SplitBar, Tile, TONE, Track, money } from "./parts"

// ---- Team today ------------------------------------------------------------------

export function TeamToday({ ops, pendingLeave, pendingCorrections }) {
  const v = useMemo(() => {
    const now = Date.now()
    const by = new Map()
    for (const p of ops.punches || []) {
      if (!by.has(p.user_id)) by.set(p.user_id, [])
      by.get(p.user_id).push(p)
    }
    const summaries = [...by.entries()].map(([id, list]) => ({ id, s: summarizeDay(ops.today, list, now) })).filter((x) => x.s.firstIn)
    const inIds = new Set(summaries.map((x) => x.id))
    const today = (ops.days || []).filter((d) => d.day === ops.today)
    const status = (d) => d.override_status || d.status
    const onLeave = new Set(today.filter((d) => status(d) === "L").map((d) => d.user_id))
    const late = today.filter((d) => d.late && inIds.has(d.user_id)).length
    const field = summaries.filter((x) => x.s.field).length
    const active = ops.profiles ? ops.profiles.filter((p) => p.active !== false) : null
    const notIn = active ? active.filter((p) => !inIds.has(p.id) && !onLeave.has(p.id)) : null
    return {
      in: inIds.size,
      total: active ? active.length : null,
      late,
      field,
      present: Math.max(0, inIds.size - late - field),
      leave: onLeave.size,
      notIn,
      review: (ops.flagged || []).length,
      missed: (ops.days || []).filter((d) => d.day === ops.yesterday && status(d) === "MP").length,
    }
  }, [ops])

  const parts = [
    { key: "present", label: "Present", value: v.present, tone: "emerald" },
    { key: "late", label: "Late", value: v.late, tone: "amber" },
    { key: "field", label: "Field", value: v.field, tone: "blue" },
    { key: "leave", label: "Leave", value: v.leave, tone: "violet" },
    v.notIn && { key: "notin", label: "Not in", value: v.notIn.length, tone: "slate" },
  ].filter(Boolean)

  return (
    <Panel title="Team today" description="From the phone app, live" action={<PanelLink to="/attendance?tab=today">Register</PanelLink>}>
      <div className="flex items-baseline gap-2">
        <span className="text-[34px] font-semibold leading-none tracking-[-0.02em] text-foreground tabular">{v.in}</span>
        <span className="text-sm font-medium leading-[17px] text-muted-foreground">{v.total != null ? `of ${v.total} in` : "clocked in"}</span>
      </div>
      <SplitBar parts={parts} />
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5 text-xs font-medium leading-[15px] text-muted-foreground">
            <Dot tone={p.tone} /> {p.label} {p.value}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Flag to="/attendance?tab=today" tone="amber" value={v.review} label="Needs review" />
        <Flag to="/attendance?tab=register" tone="rose" value={v.missed} label="Missed clock-out" />
        <Flag to="/attendance?tab=leave" tone="violet" value={pendingLeave} label="Leave pending" />
      </div>
      {v.notIn && v.notIn.length > 0 && (
        <div>
          <Kicker className="mb-1.5">{pendingCorrections ? `Not in yet · ${pendingCorrections} correction${pendingCorrections === 1 ? "" : "s"} waiting` : "Not in yet"}</Kicker>
          <Rows>
            {v.notIn.slice(0, 4).map((p) => (
              <Row key={p.id} className="py-2">
                <Initials name={p.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">{p.name || p.email}</div>
                  <div className="text-[11.5px] text-subtle-foreground">{roleLabel(p.role)}</div>
                </div>
                {p.phone && (
                  <a
                    href={`tel:${p.phone}`}
                    aria-label={`Call ${p.name}`}
                    className="squircle grid h-8 w-8 place-items-center rounded-xl border border-input text-primary transition-colors hover:bg-primary/10"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                )}
              </Row>
            ))}
          </Rows>
          {v.notIn.length > 4 && <p className="mt-1 text-xs text-subtle-foreground">and {v.notIn.length - 4} more</p>}
        </div>
      )}
    </Panel>
  )
}

function Flag({ to, tone, value, label }) {
  const t = TONE[tone]
  return (
    <Link to={to} className={cn("squircle flex flex-col gap-1 rounded-xl px-3 py-2.5 transition-opacity hover:opacity-80", value ? t.soft : "bg-subtle")}>
      <div className={cn("text-lg font-semibold leading-[22px] tabular", value ? t.text : "text-subtle-foreground")}>{value}</div>
      <div className="text-[11.5px] font-medium leading-[14px] text-muted-foreground">{label}</div>
    </Link>
  )
}

// ---- Payroll ---------------------------------------------------------------------

const STEPS = [
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Approval" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
]

export function PayrollCard({ ops }) {
  const month = thisMonthIST()
  const live = (ops.runs || []).filter((r) => r.status !== "cancelled")
  const run =
    live.find((r) => r.kind === "regular" && String(r.month).slice(0, 7) === month) ||
    live.filter((r) => r.status !== "paid").sort((a, b) => (a.month < b.month ? 1 : -1))[0] ||
    null
  const at = run ? STEPS.findIndex((s) => s.key === run.status) : -1
  const deadlines = upcomingDeadlines(ops.today, { payDay: ops.payroll?.schedule?.payDay || 7, days: 30 }).slice(0, 3)
  const claims = (ops.claims || []).length

  return (
    <Panel title="Payroll" description={run ? `${monthWords(run.month)} pay run` : "No pay run this month yet"} action={<Pill tone="violet">Payroll access</Pill>}>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-4">
          <ol className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex-1">
                <div className={cn("h-1.5 rounded-[3px]", i < at ? "bg-success" : i === at ? "bg-info" : "bg-background")} />
                <div className={cn("mt-2 text-xs leading-[15px]", i === at ? "font-semibold text-info-text" : i < at ? "font-medium text-success-text" : "text-subtle-foreground")}>{s.label}</div>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <Tile label="Payroll cost" value={run?.totals?.payrollCost ? money(run.totals.payrollCost) : "–"} />
            <Tile label="Net pay" value={run?.totals?.netPay ? money(run.totals.netPay) : "–"} sub={run?.totals?.employees ? `${run.totals.employees} employees` : null} />
          </div>
          <p className="text-[12.5px] text-muted-foreground">{nextAction(run)}</p>
        </div>
        <div>
          <Kicker className="mb-1">Due soon</Kicker>
          <Rows>
            {deadlines.map((d) => (
              <Row key={d.key}>
                <span className="flex-1 truncate text-foreground">{d.title}</span>
                <Pill tone={d.daysLeft <= 3 ? "amber" : "slate"} className="text-xs">{d.daysLeft <= 1 ? dueWords(d.daysLeft) : shortDate(d.due)}</Pill>
              </Row>
            ))}
            <Row>
              <span className="flex-1 text-foreground">Claims to approve</span>
              <Pill tone={claims ? "violet" : "slate"} className="text-xs">{claims}</Pill>
            </Row>
          </Rows>
        </div>
      </div>
    </Panel>
  )
}

// ---- People and access -------------------------------------------------------

const ROLE_FILL = { super_admin: "violet", admin: "violet", accounts: "amber", sales: "blue", staff: "slate" }

export function PeopleAccess({ ops, superAdmin }) {
  const active = ops.profiles.filter((p) => p.active !== false)
  const off = ops.profiles.length - active.length
  const byRole = ROLES.map((r) => ({ key: r, label: roleLabel(r), value: active.filter((p) => p.role === r).length, tone: ROLE_FILL[r] })).filter((r) => r.value)
  const lock = ops.locks?.[0]

  return (
    <Panel title="People and access" description={superAdmin ? "Logins, roles and the payroll lock" : "Logins and roles. Permissions are set by the Super Admin"} action={<Pill tone="violet">{superAdmin ? "Super Admin" : "Users"}</Pill>}>
      <div className="flex items-baseline gap-2">
        <span className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-foreground tabular">{active.length}</span>
        <span className="text-[13px] font-medium text-muted-foreground">active logins{off ? ` · ${off} deactivated` : ""}</span>
      </div>
      <SplitBar parts={byRole} />
      <Rows>
        {byRole.map((r) => (
          <Row key={r.key} className="py-2">
            <Dot tone={r.tone} />
            <span className="flex-1 text-foreground">{r.label}</span>
            <span className="font-semibold text-foreground tabular">{r.value}</span>
          </Row>
        ))}
      </Rows>
      {superAdmin && lock && (
        <div className="squircle flex items-center gap-2.5 rounded-xl bg-success/12 px-3.5 py-3">
          <ShieldCheck className="h-5 w-5 flex-none text-success-text" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-success-text">{monthWords(lock.month)} is locked for payroll</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Only you can unlock it, with a reason</div>
          </div>
        </div>
      )}
    </Panel>
  )
}

// ---- Recent activity -------------------------------------------------------------

export function Activity({ entries, names }) {
  return (
    <Panel title="Recent activity" description="From the audit trail">
      <ul className="flex flex-col gap-3.5">
        {entries.map((e) => {
          const who = e.actor ? names[e.actor]?.name || "Someone" : "Automation"
          return (
            <li key={e.id} className="flex gap-3">
              <Initials name={e.actor ? who : "Automation"} tone={e.actor ? "slate" : "blue"} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-4 text-foreground">
                  <span className="font-semibold">{who}</span> {(ACTION_VERB[e.action] || e.action).toLowerCase()} {collectionLabel(e.collection).toLowerCase()}{" "}
                  {e.label && <span className="font-medium">{e.label}</span>}
                </p>
                <p className="mt-0.5 text-[11.5px] text-subtle-foreground">{relativeTime(e.at)}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

// ---- Catalogue and website (admins without payroll) ---------------------------

export function CatalogueCard({ products }) {
  const active = products.filter((p) => (p.status || "active") === "active")
  const hidden = active.filter((p) => p.showOnWebsite === false).length
  const drafts = products.filter((p) => p.status === "draft").length
  const onSite = active.length - hidden
  return (
    <Panel title="Catalogue and website" description="What the website shows" action={<PanelLink to="/catalog">Catalog</PanelLink>}>
      <div className="flex gap-2">
        <Tile label="Active" value={active.length} />
        <Tile label="Hidden from site" value={hidden} />
        <Tile label="Drafts" value={drafts} />
      </div>
      <div>
        <div className="mb-2 flex justify-between text-xs font-medium text-muted-foreground">
          <span>On the website</span>
          <span className="tabular">
            {onSite} of {active.length}
          </span>
        </div>
        <Track pct={active.length ? (onSite / active.length) * 100 : 0} tone="emerald" />
      </div>
    </Panel>
  )
}
