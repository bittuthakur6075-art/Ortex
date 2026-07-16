import { useState, useEffect, useMemo } from "react"
import {
  Instagram, Facebook, Plus, Trash2, Sparkles, Search, Send, ImageIcon,
  Calendar, RefreshCw, CheckCircle2, ArrowUpRight, X,
} from "../components/icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { useCollection } from "../data/hooks"
import { useProfile } from "../data/profile"
import { newSocialPost, socialCaptionText, SOCIAL_STATUS, SOCIAL_PLATFORMS, statusMeta } from "../data/schema"
import { supabase, hasSupabase } from "../data/supabaseClient"
import PageHeader from "../components/PageHeader"
import {
  Button, Card, Input, Textarea, Select, Field, EmptyState, Modal, PageLoader, StatusBadge, Chip,
} from "../components/ui"

const PLATFORM_ICON = { instagram: Instagram, facebook: Facebook }

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
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
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

function PostCard({ post, onClick }) {
  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-colors hover:border-primary/50"
      onClick={onClick}
    >
      <div className="relative aspect-square bg-muted">
        {post.image ? (
          <img src={post.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
            <span className="text-xs">No creative yet</span>
          </div>
        )}
        <span className="absolute left-2 top-2">
          <StatusBadge list={SOCIAL_STATUS} status={post.status} />
        </span>
        <span className="absolute right-2 top-2 flex gap-1">
          {(post.platforms || []).map((id) => {
            const Icon = PLATFORM_ICON[id]
            return Icon ? (
              <span key={id} className="rounded-full bg-background/90 p-1">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            ) : null
          })}
        </span>
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-medium text-foreground">{post.topic || "Untitled"}</div>
        <div className="line-clamp-2 mt-1 text-xs text-muted-foreground">{post.caption || "No caption yet"}</div>
        {post.scheduledFor && post.status === "scheduled" && (
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(post.scheduledFor).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </div>
        )}
      </div>
    </Card>
  )
}

// ---- Research ---------------------------------------------------------------

function ResearchModal({ open, onClose }) {
  const [angle, setAngle] = useState("")
  const [count, setCount] = useState(3)
  const [busy, setBusy] = useState(false)
  const [ideas, setIdeas] = useState(null)

  useEffect(() => {
    if (open) {
      setAngle("")
      setCount(3)
      setIdeas(null)
    }
  }, [open])

  const run = async () => {
    if (!hasSupabase) return toast.error("Connect Supabase to use the researcher.")
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke("social-researcher", {
        body: { angle, count: Number(count) },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setIdeas(data.ideas || [])
    } catch (err) {
      console.error("Social research failed:", err)
      toast.error(err?.message || "Research failed")
    } finally {
      setBusy(false)
    }
  }

  const keep = async (idea) => {
    await repo.create("social", newSocialPost({ ...idea, status: "idea" }))
    setIdeas((list) => list.filter((i) => i !== idea))
    toast.success("Saved as an idea")
  }

  const keepAll = async () => {
    await repo.bulkCreate("social", ideas.map((i) => newSocialPost({ ...i, status: "idea" })))
    toast.success(`${ideas.length} ideas saved`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Research post ideas"
      width="max-w-3xl"
      footer={
        <div className="flex w-full items-center justify-between">
          <p className="text-xs text-muted-foreground">Ideas are grounded in your live products and categories.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            {ideas?.length > 0 && (
              <Button size="sm" onClick={keepAll}>
                Keep all {ideas.length}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <Field label="Angle" hint="Optional — leave blank and the researcher picks its own">
            <Input
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="e.g. School procurement season"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run() } }}
            />
          </Field>
          <Field label="How many">
            <Select value={count} onChange={(e) => setCount(e.target.value)}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </Field>
          <Button onClick={run} disabled={busy}>
            <Sparkles className="h-4 w-4" /> {busy ? "Researching…" : ideas ? "Again" : "Research"}
          </Button>
        </div>

        {ideas?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No ideas came back. Try a different angle.</p>
        )}

        {ideas?.map((idea, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-foreground">{idea.topic}</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">{idea.hook}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => keep(idea)}>
                <Plus className="h-4 w-4" /> Keep
              </Button>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{idea.caption}</p>
            <p className="mt-2 text-xs text-primary">{(idea.hashtags || []).map((h) => `#${h}`).join(" ")}</p>
          </Card>
        ))}
      </div>
    </Modal>
  )
}

// ---- Editor -----------------------------------------------------------------

function SocialEditor({ post, onClose }) {
  const profile = useProfile()
  const isAdmin = profile?.role === "admin"

  // Once a brand-new post is first persisted (by save, submit, approve, or
  // publish) we must reuse its id for every later write, or each action would
  // create a fresh duplicate row. `post` is the prop; `postId` is the live id.
  const [postId, setPostId] = useState(post?.id || null)
  const isEdit = !!postId
  const [form, setForm] = useState(() => (post ? { ...newSocialPost(), ...post } : newSocialPost()))
  const [drawing, setDrawing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [format, setFormat] = useState("square")

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const meta = statusMeta(SOCIAL_STATUS, form.status)
  const locked = form.status === "published"

  const persist = async (patch = {}) => {
    const payload = { ...form, ...patch }
    if (postId) {
      await repo.update("social", postId, payload)
      return postId
    }
    const created = await repo.create("social", payload)
    setPostId(created.id)
    return created.id
  }

  const save = async () => {
    if (!form.topic.trim()) return toast.error("A topic is required")
    await persist()
    toast.success(isEdit ? "Post updated" : "Post created")
    onClose()
  }

  // Render the creative with Gemini via the social-creative Edge Function.
  const generate = async () => {
    if (!hasSupabase) return toast.error("Connect Supabase to generate creatives.")
    if (!form.imagePrompt.trim()) return toast.error("Write an image prompt first")
    setDrawing(true)
    try {
      const { data, error } = await supabase.functions.invoke("social-creative", {
        body: { imagePrompt: form.imagePrompt, format },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setForm((f) => ({ ...f, image: data.image, status: f.status === "idea" ? "draft" : f.status }))
      toast.success("Creative generated — review it before approving")
    } catch (err) {
      console.error("Creative generation failed:", err)
      toast.error(err?.message || "Creative generation failed")
    } finally {
      setDrawing(false)
    }
  }

  const submitForReview = async () => {
    if (!form.image) return toast.error("Generate a creative first")
    if (!form.caption.trim()) return toast.error("Write a caption first")
    await persist({ status: "review" })
    setForm((f) => ({ ...f, status: "review" }))
    toast.success("Sent for approval")
  }

  const approve = async () => {
    const patch = {
      status: form.scheduledFor ? "scheduled" : "approved",
      approvedBy: profile?.email || "",
      approvedAt: new Date().toISOString(),
    }
    await persist(patch)
    setForm((f) => ({ ...f, ...patch }))
    toast.success(form.scheduledFor ? "Approved and scheduled" : "Approved — ready to publish")
  }

  const publish = async () => {
    if (!window.confirm("Publish this post to the live company profile now? This cannot be undone from here.")) return
    setPublishing(true)
    try {
      const id = await persist()
      const { data, error } = await supabase.functions.invoke("social-publish", { body: { postId: id } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success("Published")
      onClose()
    } catch (err) {
      console.error("Publish failed:", err)
      toast.error(err?.message || "Publish failed")
    } finally {
      setPublishing(false)
    }
  }

  const remove = async () => {
    if (window.confirm(`Delete post "${form.topic || "Untitled"}"?`)) {
      await repo.remove("social", postId)
      toast.success("Post deleted")
      onClose()
    }
  }

  const togglePlatform = (id) =>
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(id) ? f.platforms.filter((p) => p !== id) : [...f.platforms, id],
    }))

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Social
        </button>
        <StatusBadge list={SOCIAL_STATUS} status={form.status} />
      </div>

      <PageHeader
        title={isEdit ? form.topic || "Untitled post" : "New post"}
        subtitle={meta.id === "published" ? "Live on your profile" : "Draft, review, approve, then publish"}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Creative + copy */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h3 className="mb-4 border-b border-border pb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Creative
            </h3>
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                {form.image ? (
                  <img src={form.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-xs">No creative</span>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <Field label="Image prompt" hint="What the image model renders. No text or logos — the caption carries the words.">
                  <Textarea
                    rows={5}
                    value={form.imagePrompt}
                    onChange={(e) => set("imagePrompt", e.target.value)}
                    placeholder="e.g. A stack of custom printed acrylic name badges on a walnut desk, soft window light…"
                    disabled={locked}
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={format} onChange={(e) => setFormat(e.target.value)} className="w-auto" disabled={locked}>
                    <option value="square">Square 1:1</option>
                    <option value="portrait">Portrait 4:5</option>
                    <option value="landscape">Landscape 1.91:1</option>
                  </Select>
                  <Button variant="outline" size="sm" onClick={generate} disabled={drawing || locked}>
                    {form.image ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    {drawing ? "Rendering…" : form.image ? "Regenerate" : "Generate creative"}
                  </Button>
                  {form.image && !locked && (
                    <Button variant="ghost" size="sm" onClick={() => set("image", "")}>
                      <X className="h-4 w-4" /> Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 border-b border-border pb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Copy
            </h3>
            <div className="space-y-4">
              <Field label="Topic" required hint="Internal name for this post">
                <Input value={form.topic} onChange={(e) => set("topic", e.target.value)} placeholder="e.g. Exam Board Bulk Orders" disabled={locked} />
              </Field>
              <Field label="Caption" hint={`${form.caption.length} characters — Instagram cuts off around 125 in the feed`}>
                <Textarea rows={7} value={form.caption} onChange={(e) => set("caption", e.target.value)} placeholder="Write the caption…" disabled={locked} />
              </Field>
              <Field label="Hashtags" hint="Comma separated, without the # sign">
                <Input
                  value={(form.hashtags || []).join(", ")}
                  onChange={(e) => set("hashtags", e.target.value.split(",").map((h) => h.trim().replace(/^#/, "")).filter(Boolean))}
                  placeholder="corporategifting, lanyards, madeinindia"
                  disabled={locked}
                />
              </Field>
              {(form.caption || form.hashtags?.length > 0) && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview as posted</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{socialCaptionText(form)}</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Settings */}
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-4 border-b border-border pb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Publishing
            </h3>
            <div className="space-y-4">
              <Field label="Platforms">
                <div className="space-y-2">
                  {SOCIAL_PLATFORMS.map((p) => {
                    const Icon = PLATFORM_ICON[p.id]
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.platforms.includes(p.id)}
                          onChange={() => togglePlatform(p.id)}
                          disabled={locked}
                        />
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {p.label}
                      </label>
                    )
                  })}
                </div>
              </Field>

              <Field label="Schedule" hint="Leave blank to publish manually once approved">
                <Input
                  type="datetime-local"
                  value={form.scheduledFor ? toLocalInput(form.scheduledFor) : ""}
                  onChange={(e) => set("scheduledFor", e.target.value ? new Date(e.target.value).toISOString() : null)}
                  disabled={locked}
                />
              </Field>

              {form.approvedAt && (
                <p className="text-xs text-muted-foreground">
                  Approved by {form.approvedBy || "an admin"} on{" "}
                  {new Date(form.approvedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 border-b border-border pb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Approval
            </h3>
            <div className="space-y-3">
              {form.status === "draft" || form.status === "idea" ? (
                <Button variant="outline" className="w-full" onClick={submitForReview}>
                  <ArrowUpRight className="h-4 w-4" /> Send for approval
                </Button>
              ) : null}

              {form.status === "review" && (
                isAdmin ? (
                  <Button variant="success" className="w-full" onClick={approve}>
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Waiting on an admin to approve this post.</p>
                )
              )}

              {["approved", "scheduled", "failed"].includes(form.status) && (
                isAdmin ? (
                  <Button className="w-full" onClick={publish} disabled={publishing}>
                    <Send className="h-4 w-4" /> {publishing ? "Publishing…" : "Publish now"}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Only an admin can publish to the company profile.</p>
                )
              )}

              {form.status === "scheduled" && (
                <p className="text-xs text-muted-foreground">
                  This will publish automatically at the scheduled time. Publish now to send it early.
                </p>
              )}

              {form.error && (
                <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{form.error}</p>
              )}

              {Object.entries(form.results || {}).map(([platform, r]) => (
                <div key={platform} className="text-xs">
                  <span className="font-semibold capitalize text-foreground">{platform}: </span>
                  {r?.id ? (
                    r.permalink ? (
                      <a href={r.permalink} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        View post
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Published</span>
                    )
                  ) : (
                    <span className="text-destructive">{r?.error || "Not published"}</span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
        {isEdit ? (
          <Button variant="dangerGhost" size="sm" onClick={remove}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={locked}>
            {isEdit ? "Save" : "Create post"}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** ISO string → the `YYYY-MM-DDTHH:mm` a datetime-local input expects, in local time. */
function toLocalInput(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
