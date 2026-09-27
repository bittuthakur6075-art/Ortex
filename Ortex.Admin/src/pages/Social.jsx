import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Calendar, CheckCircle2, Hash, ImageIcon, Instagram, Send, Users } from "../components/ui/Icons"
import { useCollection } from "../hooks/useCollection"
import PageHeader, { HeaderBand } from "../components/layout/PageHeader"
import { Badge, Card, Chip, ChipGroup, EmptyState, PageLoader, SearchInput, StatCard, TableWrap, Tabs } from "../components/ui/Ui"
import { formatDateTime, relativeTime } from "../lib/format"

// Marketing: a read-only view of what the Marketing project (C:\Code\Marketing)
// has done on Instagram and LinkedIn. That project pushes its records through
// the `marketing-sync` Edge Function into the `marketing` table (migration
// 0052); each row's doc.kind is post, dm, comment or followup.

const TABS = [
  { value: "post", label: "Posts", icon: ImageIcon },
  { value: "dm", label: "DMs", icon: Send },
  { value: "comment", label: "Comments", icon: Hash },
  { value: "followup", label: "Follow-ups", icon: Users },
]

const PLATFORMS = [
  { id: "all", label: "All" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
]

const POST_STATUS = {
  published: ["Live", "emerald"],
  scheduled: ["Scheduled", "blue"],
  approved: ["Approved", "violet"],
}

const byNewest = (a, b) => String(b.at || "").localeCompare(String(a.at || ""))
const words = (r) => [r.title, r.campaign, r.text, r.to, r.note, r.name, r.handle, r.need, r.stage, r.cta].join(" ").toLowerCase()

function PlatformBadge({ platform }) {
  if (platform === "instagram")
    return (
      <Badge tone="rose">
        <Instagram className="h-3.5 w-3.5" /> Instagram
      </Badge>
    )
  if (platform === "linkedin") return <Badge tone="blue">LinkedIn</Badge>
  return <Badge>{platform || "Other"}</Badge>
}

function Outcome({ status }) {
  const ok = status === "ok" || status === "success"
  return <Badge tone={ok ? "emerald" : "rose"}>{ok ? "Sent" : status === "skipped" ? "Skipped" : "Not sent"}</Badge>
}

export default function Social() {
  const { items, loading } = useCollection("marketing")
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get("tab")) ? params.get("tab") : "post"
  const [platform, setPlatform] = useState("all")
  const [query, setQuery] = useState("")

  const byKind = useMemo(() => {
    const out = { post: [], dm: [], comment: [], followup: [] }
    for (const r of items) out[r.kind]?.push(r)
    for (const k in out) out[k].sort(byNewest)
    return out
  }, [items])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return byKind[tab].filter((r) => (platform === "all" || r.platform === platform) && (!q || words(r).includes(q)))
  }, [byKind, tab, platform, query])

  const lastSync = useMemo(() => items.reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), ""), [items])
  const live = byKind.post.filter((p) => p.status === "published").length
  const scheduled = byKind.post.filter((p) => p.status !== "published").length
  const sent = (list) => list.filter((r) => r.status === "ok" || r.status === "success").length

  return (
    <div>
      <HeaderBand>
        <PageHeader
          title="Marketing"
          subtitle={`Posts, DMs, comments and follow-ups from the marketing team${lastSync ? `. Last synced ${relativeTime(lastSync)}` : ""}`}
        />
        <Tabs
          items={TABS.map((t) => ({ ...t, count: byKind[t.value].length || undefined }))}
          value={tab}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
        />
      </HeaderBand>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Instagram}
          title="Nothing synced yet"
          description="This page fills in when the marketing machine runs npm run sync:ortex in C:\Code\Marketing."
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard icon={CheckCircle2} label="Posts live" value={live} accent="bg-success/12 text-success-text" />
            <StatCard icon={Calendar} label="Scheduled" value={scheduled} />
            <StatCard icon={Send} label="DMs sent" value={sent(byKind.dm)} accent="bg-info/10 text-info-text" />
            <StatCard icon={Hash} label="Comments" value={sent(byKind.comment)} accent="bg-warning/12 text-warning-text" />
            <StatCard icon={Users} label="Follow-ups" value={byKind.followup.length} accent="bg-destructive/10 text-destructive-text" />
          </div>

          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
            <ChipGroup className="min-w-0">
              {PLATFORMS.map((p) => (
                <Chip key={p.id} active={platform === p.id} onClick={() => setPlatform(p.id)}>
                  {p.label}
                </Chip>
              ))}
            </ChipGroup>
            <SearchInput className="md:ml-auto md:w-[320px]" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={Hash} title="No matches" description="Try a different search or platform." />
          ) : tab === "post" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          ) : tab === "followup" ? (
            <FollowUps rows={rows} />
          ) : (
            <Outreach rows={rows} />
          )}
        </>
      )}
    </div>
  )
}

function PostCard({ post }) {
  const [label, tone] = POST_STATUS[post.status] || [post.status, "slate"]
  return (
    <Card className="overflow-hidden">
      {post.image ? (
        <img src={post.image} alt={post.title || ""} loading="lazy" className="aspect-square w-full bg-secondary object-cover" />
      ) : (
        <div className="grid aspect-square w-full place-items-center bg-secondary">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <PlatformBadge platform={post.platform} />
          <Badge tone={tone}>{label}</Badge>
          {post.cta && <Badge tone="outline">{post.cta}</Badge>}
        </div>
        <h3 className="text-sm font-semibold leading-5 text-foreground">{post.title || "Untitled post"}</h3>
        {post.campaign && <p className="text-xs text-muted-foreground">{post.campaign}</p>}
        <details className="text-[13px] leading-5 text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium text-foreground">Caption</summary>
          <p className="mt-1.5 whitespace-pre-line">{post.text}</p>
        </details>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
          <span>{post.at ? formatDateTime(post.at) : "Not dated"}</span>
          {post.url && (
            <a href={post.url} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
              Open post →
            </a>
          )}
        </div>
      </div>
    </Card>
  )
}

function Outreach({ rows }) {
  return (
    <TableWrap>
      <table className="w-full text-left text-sm">
        <thead className="mt-head">
          <tr>
            <th>When</th>
            <th>Platform</th>
            <th>To</th>
            <th>Outcome</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody className="mt-body">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{r.at ? formatDateTime(r.at) : "-"}</td>
              <td>
                <PlatformBadge platform={r.platform} />
              </td>
              <td className="font-medium text-foreground">{r.to}</td>
              <td>
                <Outcome status={r.status} />
              </td>
              <td className="min-w-[240px] text-muted-foreground">{r.note || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

function FollowUps({ rows }) {
  return (
    <TableWrap>
      <table className="w-full text-left text-sm">
        <thead className="mt-head">
          <tr>
            <th>Since</th>
            <th>Prospect</th>
            <th>Platform</th>
            <th>Need</th>
            <th>Where it stands</th>
          </tr>
        </thead>
        <tbody className="mt-body">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{r.at || "-"}</td>
              <td>
                <div className="font-medium text-foreground">{r.name}</div>
                {r.handle && <div className="text-xs text-muted-foreground">@{r.handle}</div>}
              </td>
              <td>
                <PlatformBadge platform={r.platform} />
              </td>
              <td className="min-w-[200px]">{r.need || "-"}</td>
              <td className="min-w-[240px] text-muted-foreground">{r.stage || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}
