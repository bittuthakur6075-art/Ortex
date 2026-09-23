/**
 * Team chat on the phone: pure rules for how a conversation is named, what its
 * preview says, when a message counts as read and how a thread is grouped.
 *
 * MIRROR of Ortex.Admin/src/lib/chat.js (edit both); test/chat.test.mjs runs
 * both over the same conversations. The phone keeps its own hand-rolled
 * clock/date wording because Hermes' Intl varies by build (see format.ts).
 */

export type ChatKind = "direct" | "group" | "assistant" | "team"
export type MessageKind = "text" | "system" | "assistant" | "bot"

export type ChatMember = {
  id: string
  name: string | null
  avatar_url: string | null
  role: string
  active: boolean
  member_role: "owner" | "member"
  last_read_at: string | null
}

export type ChatAttachment = {
  path?: string
  name?: string
  size?: number
  type?: string
  width?: number
  height?: number
  localUri?: string
  uploading?: boolean
}

export type ChatMessage = {
  id: string
  conversation_id: string
  sender_id: string | null
  kind: MessageKind
  body: string | null
  attachment: ChatAttachment | null
  reply_to: string | null
  meta: Record<string, unknown> | null
  created_at: string
  edited_at?: string | null
  deleted_at?: string | null
  /** Local only: an optimistic send. */
  local?: "pending" | "failed"
  error?: string
}

export type Conversation = {
  id: string
  kind: ChatKind
  title: string | null
  team: string | null
  muted: boolean
  my_role: "owner" | "member"
  last_read_at: string | null
  activity_at: string
  unread: number
  members: ChatMember[]
  last_message: {
    id: string
    sender_id: string | null
    kind: MessageKind
    body: string | null
    attachment: ChatAttachment | null
    deleted: boolean
    created_at: string
    sender_name?: string | null
  } | null
}

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN

export const RUN_GAP_MS = 5 * MIN

export const isMultiPerson = (conv: Pick<Conversation, "kind"> | null | undefined) => conv?.kind === "group" || conv?.kind === "team"

export const firstName = (name: string | null | undefined) => String(name || "").trim().split(/\s+/)[0] || "Someone"

export function peerOf(conv: Conversation | null | undefined, meId: string | null): ChatMember | null {
  if (conv?.kind !== "direct") return null
  return (conv.members || []).find((m) => m.id !== meId) || null
}

export function conversationTitle(conv: Conversation | null | undefined, meId: string | null): string {
  if (!conv) return ""
  if (conv.kind === "assistant") return "Anu"
  if (conv.kind === "group" || conv.kind === "team") return conv.title || "Group"
  return peerOf(conv, meId)?.name || "Former colleague"
}

export function memberLine(conv: Conversation | null | undefined, meId: string | null): string {
  const members = conv?.members || []
  const others = members.filter((m) => m.id !== meId).map((m) => firstName(m.name))
  return (members.some((m) => m.id === meId) ? ["You", ...others] : others).join(", ")
}

export function isImage(att: ChatAttachment | null | undefined): boolean {
  return Boolean(att && String(att.type || "").startsWith("image/"))
}

export const oneLine = (text: string | null | undefined) => String(text || "").replace(/\s+/g, " ").trim()

export function previewText(conv: Conversation, meId: string | null): string {
  const last = conv?.last_message
  if (!last) return conv?.kind === "assistant" ? "Ask about leads, quotations or how to use the console" : "No messages yet"
  if (last.deleted) return last.sender_id === meId ? "You deleted this message" : "This message was deleted"
  const content = last.body
    ? oneLine(last.body)
    : last.attachment
      ? isImage(last.attachment) ? "Photo" : `File: ${last.attachment.name || "attachment"}`
      : ""
  if (last.kind === "system") return content
  if (last.kind === "assistant" || last.kind === "bot") return `Anu: ${content}`
  if (last.sender_id === meId) return `You: ${content}`
  if (isMultiPerson(conv)) {
    const who = (conv.members || []).find((m) => m.id === last.sender_id)
    return `${firstName(who?.name || last.sender_name)}: ${content}`
  }
  return content
}

export type Tick = "pending" | "failed" | "sent" | "read"

export function tickState(message: Pick<ChatMessage, "local" | "created_at">, conv: Conversation | null | undefined, meId: string | null): Tick {
  if (message.local) return message.local
  const others = (conv?.members || []).filter((m) => m.id !== meId)
  if (!others.length) return "sent"
  const at = Date.parse(message.created_at)
  const allRead = others.every((m) => m.last_read_at && Date.parse(m.last_read_at) >= at)
  return allRead ? "read" : "sent"
}

const pad = (n: number) => String(n).padStart(2, "0")
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export const clock = (ts: string | number | Date) => {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function dayDiff(a: Date, b: Date) {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  return Math.round((start(b) - start(a)) / DAY)
}

export function inboxTime(ts: string | null | undefined, now = Date.now()): string {
  if (!ts) return ""
  const d = new Date(ts)
  const days = dayDiff(d, new Date(now))
  if (days === 0) return clock(d)
  if (days === 1) return "Yesterday"
  if (days < 7) return WEEKDAYS[d.getDay()]
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`
}

export function dayLabel(ts: string, now = Date.now()): string {
  const d = new Date(ts)
  const days = dayDiff(d, new Date(now))
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return WEEKDAYS[d.getDay()]
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export type ThreadItem = { message: ChatMessage; runStart: boolean; runEnd: boolean }
export type ThreadSection = { label: string; key: string; items: ThreadItem[] }

export function threadSections(messages: ChatMessage[], now = Date.now()): ThreadSection[] {
  const sections: ThreadSection[] = []
  let current: ThreadSection | null = null
  const sameRun = (a?: ChatMessage, b?: ChatMessage) =>
    Boolean(a && b && a.kind !== "system" && b.kind !== "system" && a.kind === b.kind && a.sender_id === b.sender_id &&
      Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) < RUN_GAP_MS &&
      dayLabel(a.created_at, now) === dayLabel(b.created_at, now))
  messages.forEach((m, i) => {
    const label = dayLabel(m.created_at, now)
    if (!current || current.label !== label) {
      current = { label, key: `day:${m.created_at}`, items: [] }
      sections.push(current)
    }
    current.items.push({ message: m, runStart: !sameRun(messages[i - 1], m), runEnd: !sameRun(m, messages[i + 1]) })
  })
  return sections
}

export function searchConversations(list: Conversation[], query: string, meId: string | null): Conversation[] {
  const q = oneLine(query).toLowerCase()
  if (!q) return list
  return list.filter((c) =>
    [conversationTitle(c, meId), memberLine(c, meId), c.last_message?.body].some((s) => String(s || "").toLowerCase().includes(q)),
  )
}

export function sortInbox(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    if (a.kind === "assistant" && b.kind !== "assistant") return -1
    if (b.kind === "assistant" && a.kind !== "assistant") return 1
    return Date.parse(b.activity_at || "0") - Date.parse(a.activity_at || "0")
  })
}

export function totalUnread(list: Conversation[] | null | undefined): number {
  return (list || []).reduce((n, c) => n + (c.muted ? 0 : Number(c.unread) || 0), 0)
}

export function attachmentPath(conversationId: string, fileName: string, uuid: string): string {
  const clean = String(fileName || "file")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-80) || "file"
  return `${conversationId}/${uuid}-${clean}`
}
