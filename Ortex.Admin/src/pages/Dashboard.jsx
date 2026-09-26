import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, FileText, Sparkles, Wallet } from "../components/ui/Icons"
import { useCollections, useSettings } from "../hooks/useCollection"
import { useProfile } from "../hooks/useProfile"
import { useSocialAccounts } from "../hooks/useSocialAccounts"
import { canAccess } from "../data/domain/modules"
import { isAdmin, isSuperAdmin } from "../lib/roles"
import { currentUserId } from "../lib/auth"
import { RANGES, approvalItems, attentionItems, computeToday, dailySparks, DAY } from "../lib/analytics/today"
import { loadOps } from "../services/dashboard"
import { decideLeave } from "../services/leave"
import { decideCorrection } from "../services/attendance"
import { repo } from "../data/store/repository"
import { loadDemoData } from "../data/seed/seed"
import { formatNumber } from "../lib/format"
import { Button, EmptyState, PageLoader } from "../components/ui/Ui"
import PageHeader from "../components/layout/PageHeader"
import { canShowGateCode } from "./attendance/gate"
import { Change, Pill, Seg, Spark, money } from "./dashboard/parts"
import NeedsYou from "./dashboard/NeedsYou"
import { CashFlow, Receivables } from "./dashboard/Money"
import { LeadSources, Pipeline } from "./dashboard/Sales"
import Automation from "./dashboard/Automation"
import GateCard from "./dashboard/GateCard"
import { Activity, CatalogueCard, PayrollCard, PeopleAccess, TeamToday } from "./dashboard/People"

// A page for the next hour, not a report (V2). Two columns:
//   · the main column is the WORK: one queue of everything waiting on this
//     person, then how money and the pipeline are moving, then automation
//     health and payroll;
//   · the rail is LIVE OPERATIONS: the gate code, who is in today, what is
//     owed, where leads come from, who has access, what just changed.
// Every figure is a pure function in lib/analytics (tested) or a read in
// services/dashboard.js, and every card is gated by the module it reads, so a
// Sales Executive sees their leads and quotations rather than a wall of empty
// tiles. The slower questions stay in Insights.

const TODAY_RANGES = RANGES.map((r) => ({ value: r.value, label: r.label }))

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

export default function Dashboard() {
  const profile = useProfile()
  const navigate = useNavigate()
  const [range, setRange] = useState("30d")
  const admin = isAdmin(profile)
  const owner = isSuperAdmin(profile)

  const access = useMemo(
    () => ({
      invoices: canAccess(profile, "invoices"),
      payments: canAccess(profile, "payments"),
      enquiries: canAccess(profile, "enquiries"),
      voice: canAccess(profile, "voice-leads"),
      quotations: canAccess(profile, "quotations"),
      customers: canAccess(profile, "customers"),
      products: canAccess(profile, "products"),
      telecaller: canAccess(profile, "telecaller"),
      social: canAccess(profile, "social"),
      payroll: canAccess(profile, "payroll"),
      attendance: admin || canAccess(profile, "attendance-team"),
      gate: canShowGateCode(profile),
    }),
    [profile, admin],
  )

  // Load a module's collection only for someone who may see it.
  const names = useMemo(
    () =>
      [
        "enquiries",
        "quotations",
        "invoices",
        "payments",
        access.telecaller && "telecaller_jobs",
        access.telecaller && "telecaller_calls",
        access.social && "social",
        access.products && !access.payroll && "products",
      ].filter(Boolean),
    [access],
  )
  const { data, loading } = useCollections(names)
  const settings = useSettings()

  // ---- the reads outside quote-to-cash, kept live like the collections ----
  const [ops, setOps] = useState(null)
  const refreshOps = useCallback(async () => {
    if (!profile) return
    setOps(await loadOps({ attendance: access.attendance, people: admin, decide: admin, payroll: access.payroll, bot: admin, locks: owner }))
  }, [profile, access.attendance, access.payroll, admin, owner])
  useEffect(() => {
    void refreshOps()
    if (!repo.subscribe) return undefined
    let t = null
    const off = repo.subscribe(() => {
      clearTimeout(t)
      t = setTimeout(() => void refreshOps(), 600)
    })
    return () => {
      clearTimeout(t)
      off?.()
    }
  }, [refreshOps])

  const t = useMemo(() => computeToday(data, range), [data, range])
  const sparks = useMemo(() => dailySparks(data, 14), [data])
  const items = useMemo(() => {
    const work = attentionItems(data, access)
    const decisions = approvalItems(
      { leave: ops?.leave || [], corrections: ops?.corrections || [], runs: ops?.runs || [], social: data.social || [], calls: data.telecaller_calls || [] },
      { names: Object.fromEntries(Object.entries(ops?.names || {}).map(([id, p]) => [id, p.name])), leaveTypes: ops?.leaveTypes, selfId: currentUserId() },
      { leave: admin, corrections: admin, payroll: access.payroll, social: admin && access.social, calls: access.telecaller },
    )
    return [...decisions, ...work].sort((a, b) => a.priority - b.priority || (b.amount || 0) - (a.amount || 0))
  }, [data, ops, access, admin])

  const approve = useCallback(
    async (it) => {
      const id = it.id.replace(/^(leave|corr)-/, "")
      if (it.id.startsWith("leave-")) await decideLeave(id, true)
      else await decideCorrection(id, true)
      await refreshOps()
    },
    [refreshOps],
  )

  if (loading) return <PageLoader />

  const isEmpty = (data.enquiries?.length || 0) + (data.quotations?.length || 0) + (data.invoices?.length || 0) === 0
  if (isEmpty && ops?.demo) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Quote-to-cash at a glance" />
        <EmptyState
          icon={Sparkles}
          title="Welcome to Ortex Console"
          description="Load demo data to explore the full quote-to-cash workflow - enquiries, products, quotations, GST invoices and payments - with a populated dashboard."
          action={
            <Button onClick={loadDemoData}>
              <Sparkles className="h-4 w-4" /> Load demo data
            </Button>
          }
        />
      </div>
    )
  }

  const firstName = (profile?.name || "").split(" ")[0]
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
  const approvals = items.filter((i) => i.group === "approvals").length
  const inToday = new Set((ops?.punches || []).filter((p) => p.kind === "in").map((p) => p.user_id)).size
  const activeLogins = ops?.profiles ? ops.profiles.filter((p) => p.active !== false).length : null

  const actions = [
    access.payments && { label: "Record payment", to: "/billing?tab=payments", icon: Wallet },
    access.quotations && { label: "New quotation", to: "/quotations", icon: FileText, primary: true },
  ].filter(Boolean)

  const showPipeline = access.quotations || access.enquiries || access.voice

  return (
    <div className="space-y-6">
      {/* ---- header ---- */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold uppercase leading-[14px] tracking-[0.06em] text-subtle-foreground">{today}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.02em] text-foreground">
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            {admin && <Pill tone="violet">{owner ? "Super Admin" : "Admin"}</Pill>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {items.length === 0 ? (
              <Pill tone="emerald" size="md">Nothing is waiting on you</Pill>
            ) : (
              <>
                <Pill tone="blue" size="md">{items.length} need you</Pill>
                {approvals > 0 && <Pill tone="violet" size="md">{approvals} approval{approvals === 1 ? "" : "s"}</Pill>}
              </>
            )}
            {access.invoices && t.overdue > 0 && <Pill tone="rose" size="md">{money(t.overdue)} overdue</Pill>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Seg items={TODAY_RANGES} value={range} onChange={setRange} />
          {actions.map((a) => (
            <Button key={a.to} variant={a.primary ? "primary" : "outline"} onClick={() => navigate(a.to)}>
              <a.icon className="h-4 w-4" /> {a.label}
            </Button>
          ))}
        </div>
      </header>

      {owner && <SettingsHealth settings={settings} />}

      <Kpis t={t} access={access} sparks={sparks} />

      {/* ---- work | live ---- */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <NeedsYou items={items} onApprove={admin ? approve : null} />
          {(access.payments || access.invoices) && <CashFlow data={data} />}
          {showPipeline && <Pipeline t={t} data={data} access={access} />}
          <Automation access={access} data={data} settings={settings} bot={ops?.bot} />
          {access.payroll && ops?.runs && <PayrollCard ops={ops} />}
          {!access.payroll && access.products && data.products && <CatalogueCard products={data.products} />}
        </div>

        <aside className="min-w-0 space-y-6">
          {access.gate && <GateCard inToday={inToday} total={activeLogins} />}
          {access.attendance && ops?.punches && <TeamToday ops={ops} pendingLeave={(ops.leave || []).length} pendingCorrections={(ops.corrections || []).length} />}
          {access.invoices && <Receivables t={t} invoices={data.invoices || []} payments={data.payments || []} />}
          {(access.enquiries || access.voice) && <LeadSources data={data} range={range} />}
          {admin && ops?.profiles && <PeopleAccess ops={ops} superAdmin={owner} />}
          {ops?.activity?.length > 0 && <Activity entries={ops.activity} names={ops.names} />}
        </aside>
      </div>
    </div>
  )
}

// ---- headline figures ----------------------------------------------------------

function Kpis({ t, access, sparks }) {
  const up = (d) => (d?.dir === "down" ? "rose" : "blue")
  const cells = [
    access.payments && { label: "Cash collected", value: money(t.cash.value), change: <Change d={t.cash.delta} />, spark: sparks.cash, tone: up(t.cash.delta), sub: words(t.cash.delta, t.noun) },
    access.invoices && { label: "Revenue, taxable", value: money(t.revenue.value), change: <Change d={t.revenue.delta} />, spark: sparks.revenue, tone: up(t.revenue.delta), sub: plural(t.pipeline.find((s) => s.key === "invoiced")?.count || 0, "invoice") + " raised" },
    access.invoices && {
      label: "Outstanding",
      value: money(t.outstanding),
      change: t.overdue > 0 ? <Pill tone="amber" className="px-[7px] py-[2px] text-[11px]">Due</Pill> : null,
      spark: sparks.invoiced,
      sub: t.overdue > 0 ? `${money(t.overdue)} of it overdue` : "Nothing overdue",
    },
    access.quotations && { label: "Quoted", value: money(t.quoted.value), change: <Change d={t.quoted.delta} />, spark: sparks.quoted, tone: up(t.quoted.delta), sub: plural(t.quoted.count, "quotation") + " sent" },
    (access.enquiries || access.voice) && { label: "New leads", value: formatNumber(t.leads.value), change: <Change d={t.leads.delta} />, spark: sparks.leads, tone: up(t.leads.delta), sub: "Web and Anu calls" },
    access.quotations && {
      label: "Win rate",
      value: t.winRate.pct == null ? "–" : `${t.winRate.pct}%`,
      change: t.winRate.diff == null ? null : <Change d={{ dir: t.winRate.diff > 0 ? "up" : t.winRate.diff < 0 ? "down" : "flat", pct: t.winRate.diff }} unit=" pts" />,
      spark: sparks.won,
      sub: t.winRate.decided ? `${t.winRate.won} won of ${t.winRate.decided} decided` : "No decisions yet",
    },
  ].filter(Boolean)
  if (!cells.length) return null
  return (
    <section className="squircle grid grid-cols-2 rounded-card bg-card p-2 sm:grid-cols-3 xl:flex">
      {cells.map((c, i) => (
        <div key={c.label} className={`flex min-w-0 flex-1 flex-col gap-2.5 px-4 py-3.5 ${i ? "xl:border-l xl:border-border" : ""}`}>
          <div className="truncate text-[12.5px] font-medium leading-4 text-muted-foreground">{c.label}</div>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-2xl font-semibold leading-8 tracking-[-0.02em] text-foreground tabular">{c.value}</span>
            <span className="flex-none">{c.change}</span>
          </div>
          <Spark values={c.spark} tone={c.tone} />
          <div className="truncate text-xs leading-[15px] text-subtle-foreground">{c.sub}</div>
        </div>
      ))}
    </section>
  )
}

const plural = (n, word) => `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}`

function words(d, noun) {
  if (d.dir === "flat") return `Level with ${noun}`
  if (d.pct == null) return `Up from nothing in ${noun}`
  return `${money(Math.abs(d.diff))} ${d.dir === "up" ? "more" : "less"} than before`
}

// ---- Super Admin: settings that are quietly stopping something --------------

function SettingsHealth({ settings }) {
  const navigate = useNavigate()
  const { status } = useSocialAccounts()
  const issues = []
  const li = status?.linkedin
  const reconnectIn = li?.connected && li.reconnectBy ? Math.ceil((new Date(li.reconnectBy).getTime() - Date.now()) / DAY) : null
  if (reconnectIn != null && reconnectIn <= 14) issues.push(reconnectIn <= 0 ? "LinkedIn needs reconnecting" : `LinkedIn token expires in ${reconnectIn} day${reconnectIn === 1 ? "" : "s"}`)
  if (status?.instagram?.expired) issues.push("Instagram token has expired")
  if (settings && (settings.telecaller?.provider || "simulate") === "simulate") issues.push("Call agent is on Simulate, no real calls go out")
  if (!issues.length) return null
  return (
    <div className="squircle flex flex-wrap items-center gap-3 rounded-card bg-warning/12 px-4 py-3">
      <AlertTriangle className="h-[22px] w-[22px] flex-none text-warning-text" />
      <span className="text-[13.5px] font-semibold text-warning-text">
        {issues.length} setting{issues.length === 1 ? " needs" : "s need"} you
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
        {issues.map((s) => (
          <span key={s} className="squircle rounded-[10px] bg-card/70 px-2.5 py-[3px] text-[12.5px] font-medium leading-[15px] text-muted-foreground">
            {s}
          </span>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={() => navigate("/settings")}>
        Fix in Settings
      </Button>
    </div>
  )
}

