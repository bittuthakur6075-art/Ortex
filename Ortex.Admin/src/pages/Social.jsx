import { useState, useMemo } from "react"
import { Instagram, Plus, Sparkles, Search } from "../components/ui/Icons"
import { useCollection } from "../hooks/useCollection"
import { SOCIAL_STATUS } from "../data/domain/schema"
import PageHeader from "../components/layout/PageHeader"
import { Button, Input, EmptyState, PageLoader, Chip } from "../components/ui/Ui"
import PostCard from "./social/PostCard"
import ResearchModal from "./social/ResearchModal"
import SocialEditor from "./social/SocialEditor"

export default function Social() {
  const { items, loading } = useCollection("social")
  const [editing, setEditing] = useState(null) // post | "new" | null
  const [researching, setResearching] = useState(false)
  const [filter, setFilter] = useState("all")
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((p) => (filter === "all" ? true : p.status === filter))
      .filter((p) =>
        !q ||
        String(p.topic || "").toLowerCase().includes(q) ||
        String(p.caption || "").toLowerCase().includes(q) ||
        (p.hashtags || []).some((h) => String(h).toLowerCase().includes(q)),
      )
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
  }, [items, filter, query])

  const counts = useMemo(() => {
    const c = {}
    for (const p of items) c[p.status] = (c[p.status] || 0) + 1
    return c
  }, [items])

  if (editing) {
    return <SocialEditor post={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
  }

  return (
    <div>
      <PageHeader title="Social" subtitle="Research, design, and publish Instagram and Facebook posts — nothing goes live without approval">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setResearching(true)}>
            <Sparkles className="h-4 w-4" /> Research ideas
          </Button>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New post
          </Button>
        </div>
      </PageHeader>

      {items.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
            <Input
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics, captions, hashtags…"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              All {items.length}
            </Chip>
            {SOCIAL_STATUS.filter((s) => counts[s.id]).map((s) => (
              <Chip key={s.id} active={filter === s.id} onClick={() => setFilter(s.id)}>
                {s.label} {counts[s.id]}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Instagram}
          title="No posts yet"
          description="Let the researcher read your catalogue and propose post ideas, or write one yourself."
          action={
            <div className="flex gap-2">
              <Button onClick={() => setResearching(true)}>
                <Sparkles className="h-4 w-4" /> Research ideas
              </Button>
              <Button variant="outline" onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" /> New post
              </Button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="Try a different search or filter." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <PostCard key={p.id} post={p} onClick={() => setEditing(p)} />
          ))}
        </div>
      )}

      <ResearchModal open={researching} onClose={() => setResearching(false)} />
    </div>
  )
}
