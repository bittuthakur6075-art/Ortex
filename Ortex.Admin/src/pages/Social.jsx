import { useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { ImageIcon, Instagram, Search } from "../components/ui/Icons"
import { useCollection } from "../hooks/useCollection"
import { Drawer, EmptyState, PageLoader, PropertyRow } from "../components/ui/Ui"
import { ListHeader, SmartViews, ListSearch, InlineSelect, GroupRow, StatusDot, Tag, Initials, ListFooter, useListKeys } from "../components/sales/ListParts"
import { formatDate, formatDateTime, relativeTime } from "../lib/format"
import { clock, dayLabel } from "../lib/chat"
import { cn } from "../lib/cn"

// Marketing: a read-only view of what the Marketing project (C:\Code\Marketing)
// has done on Instagram and LinkedIn. That project pushes its records through
// the `marketing-sync` Edge Function into the `marketing` table (migration
// 0052); each row's doc.kind is post, dm, comment or followup. Built on the V2
// list parts (Leads): smart views are the tabs, one table card, rows grouped by
// day, and a row opens the full record in a drawer.

const KINDS = ["post", "dm", "comment", "followup"]

const PLATFORMS = [
  { value: "all", label: "All" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
]

const POST_STATUS = {
  published: ["Live", "emerald"],
  scheduled: ["Scheduled", "blue"],
  approved: ["Approved", "violet"],
}
const OUTCOME = {
  ok: ["Sent", "emerald"],
  fail: ["Not sent", "rose"],
  skipped: ["Skipped", "slate"],
}
const STATUS_FILTERS = {
  post: [{ value: "all", label: "All" }, ...Object.entries(POST_STATUS).map(([value, [label]]) => ({ value, label }))],
  dm: [{ value: "all", label: "All" }, ...Object.entries(OUTCOME).slice(0, 2).map(([value, [label]]) => ({ value, label }))],
  comment: [{ value: "all", label: "All" }, ...Object.entries(OUTCOME).map(([value, [label]]) => ({ value, label }))],
}

// Where a follow-up stands, read off the marketing team's free-text stage.
const STAGES = [
  [/samples? sent/i, "Samples sent", "violet"],
  [/replied/i, "Replied", "emerald"],
  [/auto-reply/i, "Auto-reply", "amber"],
]
const stageOf = (text = "") => STAGES.find(([re]) => re.test(text))?.slice(1) || ["In touch", "slate"]

// "LABEL OEM hamper parts" -> ["LABEL", "OEM hamper parts"]: the campaign keyword leads the need.
const splitNeed = (need = "") => need.match(/^([A-Z]{3,})\b\s*(.*)$/)?.slice(1) || ["", need]

const outcomeOf = (s) => (s === "success" ? "ok" : OUTCOME[s] ? s : "fail")
const byNewest = (a, b) => String(b.at || "").localeCompare(String(a.at || ""))
const words = (r) => [r.title, r.campaign, r.text, r.to, r.note, r.name, r.handle, r.need, r.stage, r.cta, r.keyword].join(" ").toLowerCase()
const igProfile = (handle) => (/^@?[\w.]+$/.test(handle || "") ? `https://www.instagram.com/${handle.replace(/^@/, "")}/` : "")

function PlatformMark({ platform, className }) {
  if (platform === "instagram") return <Instagram className={cn("h-3.5 w-3.5 flex-none text-destructive-text", className)} />
  if (platform === "linkedin")
    return <span className={cn("grid h-3.5 w-3.5 flex-none place-items-center rounded-[3px] bg-primary text-[8px] font-bold leading-none text-primary-foreground", className)}>in</span>
  return null
}

const platformName = (p) => PLATFORMS.find((x) => x.value === p)?.label || p || "Other"

export default function Social() {
  const { items, loading } = useCollection("marketing")
  const [params, setParams] = useSearchParams()
  const tab = KINDS.includes(params.get("tab")) ? params.get("tab") : "post"
  const [platform, setPlatform] = useState("all")
  const [status, setStatus] = useState("all")
  const [query, setQuery] = useState("")
  const [openId, setOpenId] = useState(null)
  const searchRef = useRef(null)
  useListKeys({ "/": () => searchRef.current?.focus() }, [])

  const byKind = useMemo(() => {
    const out = { post: [], dm: [], comment: [], followup: [] }
    for (const r of items) out[r.kind]?.push(r)
    for (const k in out) out[k].sort(byNewest)
    return out
  }, [items])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const st = (r) => (tab === "post" ? r.status : outcomeOf(r.status))
    return byKind[tab].filter(
      (r) => (platform === "all" || r.platform === platform) && (status === "all" || st(r) === status) && (!q || words(r).includes(q)),
    )
  }, [byKind, tab, platform, status, query])

  const lastSync = useMemo(() => items.reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), ""), [items])
  const count = (list, s) => list.filter((r) => outcomeOf(r.status) === s).length
  const live = byKind.post.filter((p) => p.status === "published").length
  const dmFails = count(byKind.dm, "fail")
  const commentFails = count(byKind.comment, "fail")

  const views = [
    { key: "post", label: "Posts", value: byKind.post.length, sub: `${live} live`, tone: "emerald" },
    { key: "dm", label: "DMs", value: byKind.dm.length, sub: dmFails ? `${dmFails} not sent` : "all sent", tone: "blue", alert: dmFails > 0 },
    { key: "comment", label: "Comments", value: byKind.comment.length, sub: commentFails ? `${commentFails} not sent` : "all posted", tone: "amber", alert: commentFails > 0 },
    { key: "followup", label: "Follow-ups", value: byKind.followup.length, sub: "prospects", tone: "violet" },
  ]
  const switchTab = (v) => {
    setParams({ tab: v }, { replace: true })
    setStatus("all")
  }
  const open = openId ? items.find((r) => r.id === openId) : null

  return (
    <div className="space-y-4 pb-8">
      <ListHeader
        title="Marketing"
        summary={`Instagram and LinkedIn work from the marketing team${lastSync ? `. Last synced ${relativeTime(lastSync)}` : ""}`}
      />

      {!loading && items.length > 0 && <SmartViews views={views} value={tab} onChange={switchTab} className="md:grid-cols-4" />}

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState icon={Instagram} title="Nothing synced yet" description="Posts, DMs and comments appear here once the marketing team's tools sync." />
      ) : (
        <div className="squircle overflow-hidden rounded-card bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <ListSearch inputRef={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${views.find((v) => v.key === tab).label.toLowerCase()}`} />
            <div className="ml-auto flex items-center gap-2">
              <InlineSelect label="Platform" value={platform} onChange={setPlatform} options={PLATFORMS} />
              {STATUS_FILTERS[tab] && <InlineSelect label="Status" value={status} onChange={setStatus} options={STATUS_FILTERS[tab]} />}
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={Search} title="No matches" description="Try another search, platform or status." className="rounded-none border-0" />
          ) : tab === "post" ? (
            <PostGrid rows={rows} onOpen={setOpenId} />
          ) : tab === "followup" ? (
            <FollowUps rows={rows} onOpen={setOpenId} activeId={openId} />
          ) : (
            <Outreach rows={rows} kind={tab} onOpen={setOpenId} activeId={openId} />
          )}

          {rows.length > 0 && <ListFooter shown={rows.length} total={byKind[tab].length} help="Press / to search" />}
        </div>
      )}

      <Detail record={open} onClose={() => setOpenId(null)} />
    </div>
  )
}

// ---- Posts -----------------------------------------------------------------

function PostGrid({ rows, onOpen }) {
  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((p) => {
        const [label, tone] = POST_STATUS[p.status] || [p.status, "slate"]
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className="squircle group flex flex-col overflow-hidden rounded-xl border border-line bg-card text-left transition-colors hover:border-primary/40"
          >
            <div className="relative aspect-square w-full bg-muted">
              {p.image ? (
                <img src={p.image} alt={p.title || ""} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <span className="absolute left-2.5 top-2.5 rounded-full bg-card px-2 py-1">
                <StatusDot tone={tone}>{label}</StatusDot>
              </span>
              <span className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-card">
                <PlatformMark platform={p.platform} />
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-3.5">
              <h3 className="line-clamp-2 text-[13px] font-semibold leading-[18px] text-foreground">{p.title || "Untitled post"}</h3>
              {p.campaign && <p className="truncate text-xs text-muted-foreground">{p.campaign}</p>}
              <p className="line-clamp-2 text-xs leading-[17px] text-muted-foreground">{p.text}</p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-1.5 text-[11px] text-muted-foreground">
                <span className="tabular">{p.at ? formatDateTime(p.at) : "Not dated"}</span>
                {p.cta && <Tag>{p.cta}</Tag>}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ---- DMs and comments ------------------------------------------------------

// Rows are already newest first, so consecutive runs of one day make the groups.
function byDay(rows) {
  const groups = []
  for (const r of rows) {
    const key = r.at ? String(r.at).slice(0, 10) : "undated"
    if (groups.at(-1)?.key !== key) groups.push({ key, label: r.at ? dayLabel(r.at) : "No date", rows: [] })
    groups.at(-1).rows.push(r)
  }
  return groups
}

function Outreach({ rows, kind, onOpen, activeId }) {
  const dm = kind === "dm"
  const cols = dm ? 5 : 4
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] table-fixed text-left">
        <colgroup>
          <col style={{ width: dm ? "30%" : "36%" }} />
          {dm && <col style={{ width: 110 }} />}
          <col style={{ width: 120 }} />
          <col />
          <col style={{ width: 80 }} />
        </colgroup>
        <thead className="v2-head">
          <tr>
            <th style={{ paddingLeft: 16 }}>{dm ? "Sent to" : "On post"}</th>
            {dm && <th>Campaign</th>}
            <th>Outcome</th>
            <th>Note</th>
            <th className="text-right" style={{ paddingRight: 16 }}>Time</th>
          </tr>
        </thead>
        <tbody className="v2-body">
          {byDay(rows).map((g) => {
            const fails = g.rows.filter((r) => outcomeOf(r.status) === "fail").length
            return (
              <Group key={g.key} g={g} cols={cols} tone={fails ? "rose" : "slate"} hint={fails ? `${fails} not sent` : ""}>
                {g.rows.map((r) => {
                  const [label, tone] = OUTCOME[outcomeOf(r.status)]
                  return (
                    <tr key={r.id} className="v2-row" data-selected={activeId === r.id} onClick={() => onOpen(r.id)}>
                      <td style={{ paddingLeft: 16 }}>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Initials name={(r.to || "").replace(/^@/, "")} size={30} badge={<PlatformMark platform={r.platform} className="h-2.5 w-2.5" />} />
                          <span className="truncate font-medium text-foreground" title={r.to}>{r.to || "Unknown"}</span>
                        </div>
                      </td>
                      {dm && <td>{r.keyword ? <Tag tone="blue">{r.keyword}</Tag> : <span className="text-subtle-foreground">-</span>}</td>}
                      <td>
                        <StatusDot tone={tone}>{label}</StatusDot>
                      </td>
                      <td>
                        <p className="line-clamp-2 text-muted-foreground" title={r.note}>{r.note || <span className="text-subtle-foreground">-</span>}</p>
                      </td>
                      <td className="text-right tabular text-muted-foreground" style={{ paddingRight: 16 }}>{r.at ? clock(r.at) : "-"}</td>
                    </tr>
                  )
                })}
              </Group>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Group({ g, cols, tone, hint, children }) {
  return (
    <>
      <GroupRow tone={tone} label={g.label} count={g.rows.length} hint={hint} colSpan={cols} />
      {children}
    </>
  )
}

// ---- Follow-ups ------------------------------------------------------------

function FollowUps({ rows, onOpen, activeId }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] table-fixed text-left">
        <colgroup>
          <col style={{ width: "26%" }} />
          <col style={{ width: "28%" }} />
          <col />
          <col style={{ width: 110 }} />
        </colgroup>
        <thead className="v2-head">
          <tr>
            <th style={{ paddingLeft: 16 }}>Prospect</th>
            <th>Needs</th>
            <th>Where it stands</th>
            <th className="text-right" style={{ paddingRight: 16 }}>Since</th>
          </tr>
        </thead>
        <tbody className="v2-body">
          {rows.map((r) => {
            const [keyword, need] = splitNeed(r.need)
            const [stage, tone] = stageOf(r.stage)
            return (
              <tr key={r.id} className="v2-row" data-selected={activeId === r.id} onClick={() => onOpen(r.id)}>
                <td style={{ paddingLeft: 16 }}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Initials name={r.name} size={30} badge={<PlatformMark platform={r.platform} className="h-2.5 w-2.5" />} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{r.name || "Unknown"}</p>
                      {r.handle && <p className="truncate text-xs text-muted-foreground">@{r.handle}</p>}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="flex min-w-0 items-center gap-1.5">
                    {keyword && <Tag tone="blue">{keyword}</Tag>}
                    <span className="truncate text-foreground" title={need}>{need || "-"}</span>
                  </div>
                </td>
                <td>
                  <div className="flex min-w-0 flex-col gap-1">
                    <StatusDot tone={tone}>{stage}</StatusDot>
                    <span className="truncate text-xs text-muted-foreground" title={r.stage}>{r.stage}</span>
                  </div>
                </td>
                <td className="text-right tabular text-muted-foreground" style={{ paddingRight: 16 }}>{r.at ? formatDate(r.at) : "-"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---- Detail drawer ---------------------------------------------------------

function Detail({ record: r, onClose }) {
  if (!r) return null
  const link = (href, text) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
      {text}
    </a>
  )
  const when = r.at ? (r.kind === "followup" ? formatDate(r.at) : formatDateTime(r.at)) : null

  if (r.kind === "post") {
    const [label, tone] = POST_STATUS[r.status] || [r.status, "slate"]
    return (
      <Drawer open onClose={onClose} title={r.title || "Untitled post"} subtitle={r.campaign}>
        {r.image && <img src={r.image} alt={r.title || ""} className="mb-4 aspect-square w-full rounded-xl bg-muted object-cover" />}
        <PropertyRow label="Status"><StatusDot tone={tone}>{label}</StatusDot></PropertyRow>
        <PropertyRow label="Platform">{platformName(r.platform)}</PropertyRow>
        <PropertyRow label={r.status === "published" ? "Posted" : "Goes out"}>{when}</PropertyRow>
        {r.cta && <PropertyRow label="Call to action">{r.cta}</PropertyRow>}
        {r.url && <PropertyRow label="Post">{link(r.url, "Open post")}</PropertyRow>}
        {r.productUrl && <PropertyRow label="Product page">{link(r.productUrl, "Open product")}</PropertyRow>}
        <h4 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Caption</h4>
        <p className="whitespace-pre-line text-sm leading-6 text-foreground">{r.text || "No caption"}</p>
      </Drawer>
    )
  }

  if (r.kind === "followup") {
    const [keyword, need] = splitNeed(r.need)
    const [stage, tone] = stageOf(r.stage)
    const profile = r.platform === "instagram" && igProfile(r.handle)
    return (
      <Drawer open onClose={onClose} title={r.name || "Prospect"} subtitle={r.handle ? `@${r.handle}` : platformName(r.platform)}>
        <PropertyRow label="Platform">{platformName(r.platform)}</PropertyRow>
        {profile && <PropertyRow label="Profile">{link(profile, "Open on Instagram")}</PropertyRow>}
        <PropertyRow label="Campaign">{keyword || null}</PropertyRow>
        <PropertyRow label="Needs">{need || null}</PropertyRow>
        {r.qty != null && <PropertyRow label="Quantity">{r.qty}</PropertyRow>}
        <PropertyRow label="Since">{when}</PropertyRow>
        <PropertyRow label="Stage"><StatusDot tone={tone}>{stage}</StatusDot></PropertyRow>
        <h4 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where it stands</h4>
        <p className="whitespace-pre-line text-sm leading-6 text-foreground">{r.stage || "No notes"}</p>
      </Drawer>
    )
  }

  const [label, tone] = OUTCOME[outcomeOf(r.status)]
  const profile = r.platform === "instagram" && igProfile(r.to)
  return (
    <Drawer open onClose={onClose} title={r.to || "Unknown"} subtitle={r.kind === "dm" ? "Direct message" : "Comment"}>
      <PropertyRow label="Outcome"><StatusDot tone={tone}>{label}</StatusDot></PropertyRow>
      <PropertyRow label="Platform">{platformName(r.platform)}</PropertyRow>
      {profile && <PropertyRow label="Profile">{link(profile, "Open on Instagram")}</PropertyRow>}
      {r.keyword && <PropertyRow label="Campaign">{r.keyword}</PropertyRow>}
      <PropertyRow label="When">{when}</PropertyRow>
      <h4 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Note</h4>
      <p className="whitespace-pre-line text-sm leading-6 text-foreground">{r.note || "No note"}</p>
    </Drawer>
  )
}
