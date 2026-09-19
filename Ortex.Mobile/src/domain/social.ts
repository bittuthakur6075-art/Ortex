// Social posts on the phone: the same `social` rows the console's Social page
// edits (Ortex.Admin/src/pages/social/, migrations 0013/0014/0035), so a post
// drafted here is approved there and the other way round.
//
// Mirrors, keep in step:
//   · SOCIAL_STATUS / SOCIAL_PLATFORMS / newSocialPost  ← Admin data/domain/schema.js
//   · captionText                                        ← schema.js socialCaptionText
//   · ADMIN_ONLY / problemWith                           ← Admin pages/social/SocialEditor.jsx
//   · IG limits and feed formats                         ← Admin lib/socialImage.js
// The database enforces the approval rules; these only keep the phone from
// offering what the database would refuse.

import type { Row, StatusOption } from "@/domain/schema"

export const SOCIAL_STATUS: StatusOption[] = [
  { id: "idea", label: "Idea", tone: "slate" },
  { id: "draft", label: "Draft", tone: "blue" },
  { id: "review", label: "In review", tone: "amber" },
  { id: "approved", label: "Approved", tone: "violet" },
  { id: "scheduled", label: "Scheduled", tone: "cyan" },
  { id: "publishing", label: "Publishing", tone: "blue" },
  { id: "published", label: "Published", tone: "emerald" },
  { id: "failed", label: "Failed", tone: "rose" },
]

export type Platform = "instagram" | "facebook" | "linkedin"

export const SOCIAL_PLATFORMS: { id: Platform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook Page" },
  { id: "linkedin", label: "LinkedIn Page" },
]

export type SocialFormat = "square" | "portrait" | "landscape"

/** Instagram's feed shapes, as width:height. The console crops to the same sizes. */
export const SOCIAL_FORMATS: { key: SocialFormat; label: string; size: [number, number] }[] = [
  { key: "square", label: "Square", size: [1080, 1080] },
  { key: "portrait", label: "Portrait", size: [1080, 1350] },
  { key: "landscape", label: "Landscape", size: [1200, 628] },
]

export const formatOf = (key?: string) => SOCIAL_FORMATS.find((f) => f.key === key) ?? SOCIAL_FORMATS[0]

export const IG_MAX_CAPTION = 2200
export const IG_MAX_HASHTAGS = 30

export type SocialResult = { id?: string; permalink?: string; error?: string }

export type SocialPost = {
  status: string
  topic: string
  hook: string
  caption: string
  hashtags: string[]
  imagePrompt: string
  image: string
  imageSource: "" | "upload" | "catalogue" | "ai" | "restyle"
  sourceImage: string
  format: SocialFormat
  platforms: Platform[]
  productId: string | null
  scheduledFor: string | null
  approvedBy: string
  approvedAt: string | null
  publishedAt: string | null
  results: Partial<Record<Platform, SocialResult>>
  error: string
}

export function newSocialPost(overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    status: "idea",
    topic: "",
    hook: "",
    caption: "",
    hashtags: [],
    imagePrompt: "",
    image: "",
    imageSource: "",
    sourceImage: "",
    format: "square",
    platforms: ["instagram", "facebook"],
    productId: null,
    scheduledFor: null,
    approvedBy: "",
    approvedAt: null,
    publishedAt: null,
    results: {},
    error: "",
    ...overrides,
  }
}

/** Caption + hashtags exactly as Instagram and Facebook receive them. */
export function captionText(post: Pick<SocialPost, "caption" | "hashtags">): string {
  const tags = (post.hashtags || []).filter(Boolean).map((t) => `#${String(t).replace(/^#/, "")}`)
  return [String(post.caption || "").trim(), tags.join(" ")].filter(Boolean).join("\n\n")
}

/** "a, #b,  c" → ["a", "b", "c"] */
export function parseHashtags(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((h) => h.trim().replace(/^#+/, ""))
    .filter(Boolean)
}

/** Statuses only an admin may set or edit (0014 + 0035). */
export const ADMIN_ONLY = ["approved", "scheduled", "publishing", "published", "failed"]

/** What the connected accounts are, from the `social-accounts` function. */
export type AccountStatus = {
  meta?: { instagram?: boolean; facebook?: boolean }
  linkedin?: { configured?: boolean; connected?: boolean; expired?: boolean; name?: string | null; reconnectBy?: string | null }
} | null

/** Can this platform be posted to? Unknown (not loaded yet) counts as yes. */
export function platformReady(accounts: AccountStatus, platform: Platform): boolean {
  if (!accounts) return true
  if (platform === "linkedin") return Boolean(accounts.linkedin?.connected)
  return Boolean(accounts.meta?.[platform])
}

const PLATFORM_NAME: Record<Platform, string> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn" }

/** What would stop this post going out, as a sentence, or "". */
export function problemWith(post: SocialPost, accounts: AccountStatus): string {
  if (!String(post.topic || "").trim()) return "Give the post a topic."
  if (!post.image) return "Add a photo first."
  if (!String(post.caption || "").trim()) return "Write a caption first."
  if (!(post.platforms || []).length) return "Choose at least one platform."
  const offline = post.platforms.filter((p) => !platformReady(accounts, p))
  if (offline.length) {
    const names = offline.map((p) => PLATFORM_NAME[p] || p).join(" and ")
    return `${names} ${offline.length > 1 ? "are" : "is"} not connected yet. Untick ${offline.length > 1 ? "them" : "it"}.`
  }
  if (post.platforms.includes("instagram")) {
    const posted = captionText(post)
    if (posted.length > IG_MAX_CAPTION) {
      return `Caption and hashtags are ${posted.length} characters; Instagram allows ${IG_MAX_CAPTION}.`
    }
    if ((post.hashtags || []).length > IG_MAX_HASHTAGS) return `Instagram allows ${IG_MAX_HASHTAGS} hashtags.`
  }
  return ""
}

// ---- the list ---------------------------------------------------------------------

export type SocialTab = "review" | "scheduled" | "drafts" | "published"

/** Which segment of the phone's list a post belongs in. */
export function tabOf(status: string): SocialTab {
  if (status === "review" || status === "failed") return "review"
  if (status === "approved" || status === "scheduled" || status === "publishing") return "scheduled"
  if (status === "published") return "published"
  return "drafts"
}

const ms = (ts?: string | null) => (ts ? new Date(ts).getTime() || 0 : 0)

/**
 * The order each segment reads best in: what goes out next first on Scheduled,
 * the newest first everywhere else.
 */
export function sortForTab<T extends SocialPost & Row>(posts: T[], tab: SocialTab): T[] {
  const list = [...posts]
  if (tab === "scheduled") {
    return list.sort((a, b) => (ms(a.scheduledFor) || Infinity) - (ms(b.scheduledFor) || Infinity))
  }
  if (tab === "published") return list.sort((a, b) => ms(b.publishedAt || b.updatedAt) - ms(a.publishedAt || a.updatedAt))
  return list.sort((a, b) => ms(b.updatedAt || b.createdAt) - ms(a.updatedAt || a.createdAt))
}

// ---- scheduling -----------------------------------------------------------------

/**
 * The next `count` days as picker options, starting today. `key` is YYYY-MM-DD
 * in the phone's local time; the label reads "Today", "Tomorrow", "Mon 22 Sep".
 */
export function scheduleDays(now: Date, count = 14): { key: string; label: string; date: Date }[] {
  const out = []
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const label =
      i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
    out.push({ key, label, date: d })
  }
  return out
}

/**
 * Posting times, every 30 minutes from 7:00 to 22:30. On today, only times at
 * least `leadMinutes` ahead are offered: the publish sweep runs every 15
 * minutes, so a post needs a little room to be picked up at the time chosen.
 */
export function scheduleTimes(day: Date, now: Date, leadMinutes = 20): { key: string; label: string; at: Date }[] {
  const out = []
  for (let h = 7; h <= 22; h++) {
    for (const m of [0, 30]) {
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
      if (at.getTime() < now.getTime() + leadMinutes * 60_000) continue
      const key = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      const label = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
      out.push({ key, label, at })
    }
  }
  return out
}

/** Good default slots for a B2B audience in India, shown as shortcuts. */
export const SUGGESTED_TIMES = ["10:00", "13:00", "18:30"]

/** "Tomorrow, 10:00 am" / "Mon 22 Sep, 6:30 pm" for a stored ISO time. */
export function whenLabel(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const days = scheduleDays(now, 400)
  const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const day = days.find((x) => x.key === dayKey)?.label ?? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
  return `${day}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
}
