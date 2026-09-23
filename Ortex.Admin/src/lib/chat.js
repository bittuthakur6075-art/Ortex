// Pure helpers for Team chat (pages/Chat.jsx, migration 0045): how a
// conversation is named, what its preview line says, when a message counts as
// read, and how a thread is grouped into days and runs. No React, no Supabase,
// so every rule here is tested in chat.test.js.

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN

/** A run of bubbles from one sender breaks after this gap, like WhatsApp. */
export const RUN_GAP_MS = 5 * MIN

export const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "Someone"

/** The other person in a direct chat (null for groups and the Anu thread). */
export function peerOf(conv, meId) {
  if (conv?.kind !== "direct") return null
  return (conv.members || []).find((m) => m.id !== meId) || null
}

export function conversationTitle(conv, meId) {
  if (!conv) return ""
  if (conv.kind === "assistant") return "Anu"
  if (conv.kind === "group") return conv.title || "Group"
  return peerOf(conv, meId)?.name || "Former colleague"
}

/** A group's member line: "You, Priya, Rahul". */
export function memberLine(conv, meId) {
  const members = conv?.members || []
  const others = members.filter((m) => m.id !== meId).map((m) => firstName(m.name))
  return (members.some((m) => m.id === meId) ? ["You", ...others] : others).join(", ")
}

export function isImage(att) {
  return Boolean(att && String(att.type || "").startsWith("image/"))
}

/** What the inbox row says under the name. */
export function previewText(conv, meId) {
  const last = conv?.last_message
  if (!last) return conv?.kind === "assistant" ? "Ask about leads, quotations or how to use the console" : "No messages yet"
  if (last.deleted) return last.sender_id === meId ? "You deleted this message" : "This message was deleted"
  const content = last.body
    ? oneLine(last.body)
    : last.attachment
      ? isImage(last.attachment) ? "Photo" : `File: ${last.attachment.name || "attachment"}`
      : ""
  if (last.kind === "system") return content
  if (last.kind === "assistant") return `Anu: ${content}`
  if (last.sender_id === meId) return `You: ${content}`
  if (conv.kind === "group") {
    const who = (conv.members || []).find((m) => m.id === last.sender_id)
    return `${firstName(who?.name)}: ${content}`
  }
  return content
}

export const oneLine = (text) => String(text || "").replace(/\s+/g, " ").trim()

/**
 * Tick state of MY message: "pending" and "failed" are local sends; "read" once
 * every other member has read up to it; otherwise "sent". Anyone who left the
 * group simply stops counting.
 */
export function tickState(message, conv, meId) {
  if (message.local) return message.local // "pending" | "failed"
  const others = (conv?.members || []).filter((m) => m.id !== meId)
  if (!others.length) return "sent"
  const at = Date.parse(message.created_at)
  const allRead = others.every((m) => m.last_read_at && Date.parse(m.last_read_at) >= at)
  return allRead ? "read" : "sent"
}

/** Inbox time: "14:05" today, "Yesterday", the weekday this week, else "12/09/26". */
export function inboxTime(ts, now = Date.now()) {
  if (!ts) return ""
  const d = new Date(ts)
  const days = dayDiff(d, new Date(now))
  if (days === 0) return clock(d)
  if (days === 1) return "Yesterday"
  if (days < 7) return d.toLocaleDateString("en-IN", { weekday: "long" })
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

/** The label of a day separator in a thread. */
export function dayLabel(ts, now = Date.now()) {
  const d = new Date(ts)
  const days = dayDiff(d, new Date(now))
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return d.toLocaleDateString("en-IN", { weekday: "long" })
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
}

export const clock = (d) => new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })

function dayDiff(a, b) {
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  return Math.round((start(b) - start(a)) / DAY)
}

/**
 * Messages (oldest first) as day sections, each message marked with whether it
 * starts a run (show the sender's name/avatar) and ends one (show the tail).
 */
export function threadSections(messages, now = Date.now()) {
  const sections = []
  let current = null
  messages.forEach((m, i) => {
    const label = dayLabel(m.created_at, now)
    if (!current || current.label !== label) {
      current = { label, key: `day:${m.created_at}`, items: [] }
      sections.push(current)
    }
    const prev = messages[i - 1]
    const next = messages[i + 1]
    const sameRun = (a, b) =>
      a && b && a.kind !== "system" && b.kind !== "system" && a.kind === b.kind && a.sender_id === b.sender_id &&
      Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) < RUN_GAP_MS &&
      dayLabel(a.created_at, now) === dayLabel(b.created_at, now)
    current.items.push({ message: m, runStart: !sameRun(prev, m), runEnd: !sameRun(m, next) })
  })
  return sections
}

/** Inbox search over names, group titles and the last message. */
export function searchConversations(list, query, meId) {
  const q = oneLine(query).toLowerCase()
  if (!q) return list
  return list.filter((c) =>
    [conversationTitle(c, meId), memberLine(c, meId), c.last_message?.body]
      .some((s) => String(s || "").toLowerCase().includes(q)),
  )
}

/** Inbox order: the Anu thread pinned first, then newest activity. */
export function sortInbox(list) {
  return [...list].sort((a, b) => {
    if (a.kind === "assistant" && b.kind !== "assistant") return -1
    if (b.kind === "assistant" && a.kind !== "assistant") return 1
    return Date.parse(b.activity_at || 0) - Date.parse(a.activity_at || 0)
  })
}

/** Unread across every conversation, ignoring muted ones (as the badge shows it). */
export function totalUnread(list) {
  return (list || []).reduce((n, c) => n + (c.muted ? 0 : Number(c.unread) || 0), 0)
}

/** A safe storage key for an upload: `<conversation>/<uuid>-<cleaned name>`. */
export function attachmentPath(conversationId, fileName, uuid) {
  const clean = String(fileName || "file")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-80) || "file"
  return `${conversationId}/${uuid}-${clean}`
}

export function fileSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Split text into plain and link segments, for rendering URLs as links. */
export function linkSegments(text) {
  const out = []
  const re = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi
  let last = 0
  let m
  const s = String(text || "")
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) })
    out.push({ text: m[0], href: m[0] })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ text: s.slice(last) })
  return out
}
