/**
 * Team chat state on the phone — the port of Ortex.Admin/src/hooks/useChat.js.
 *
 * The INBOX is one module-level store (the tab badge, the Chat tab and the
 * notifier all read it), fetched once and kept live by the chat channel and
 * by coming back to the foreground. A THREAD is per open conversation, with
 * optimistic sends: the bubble appears at once and turns into the saved row.
 */

import React from "react"
import { AppState } from "react-native"

import { sortInbox, totalUnread, type ChatAttachment, type ChatMessage, type Conversation } from "@/domain/chat"
import { chat, newMessageId, onChatChange, PAGE_SIZE, rejoinChat } from "@/lib/chat"
import { hasSupabase, supabase } from "@/data/supabase"

type InboxState = { list: Conversation[]; loading: boolean; error: string; missing: boolean }

let state: InboxState = { list: [], loading: true, error: "", missing: false }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
const set = (patch: Partial<InboxState>) => {
  state = { ...state, ...patch }
  emit()
}

let inflight: Promise<void> | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let started = false
let active: string | null = null

export async function reloadInbox(): Promise<void> {
  if (!hasSupabase) return
  if (inflight) return inflight
  inflight = chat
    .inbox()
    .then((list) => set({ list: sortInbox(list || []), loading: false, error: "", missing: false }))
    .catch((e: { message?: string; missing?: boolean }) => set({ loading: false, error: e?.message || "Could not load chats", missing: Boolean(e?.missing) }))
    .finally(() => {
      inflight = null
    })
  return inflight
}

const reloadSoon = () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void reloadInbox(), 250)
}

function start() {
  if (started || !hasSupabase) return
  started = true
  onChatChange(reloadSoon)
  AppState.addEventListener("change", (s) => {
    if (s === "active") {
      rejoinChat()
      reloadSoon()
    }
  })
}

/** Signing out: forget everything this account's chats held. */
export function resetChat() {
  state = { list: [], loading: true, error: "", missing: false }
  emit()
}

export const getInbox = () => state.list
export const setActiveConversation = (id: string | null) => {
  active = id
}
export const getActiveConversation = () => active

export function patchConversation(id: string, patch: Partial<Conversation>) {
  set({ list: state.list.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
}

export function useChatInbox() {
  const snap = React.useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => state,
  )
  React.useEffect(() => {
    start()
    void reloadInbox()
  }, [])
  return { ...snap, unread: totalUnread(snap.list), reload: reloadInbox }
}

// ---- one open thread ------------------------------------------------------------

const byTime = (a: ChatMessage, b: ChatMessage) => Date.parse(a.created_at) - Date.parse(b.created_at)

function merge(list: ChatMessage[], row: ChatMessage): ChatMessage[] {
  const i = list.findIndex((m) => m.id === row.id)
  if (i === -1) return [...list, row].sort(byTime)
  const next = [...list]
  next[i] = { ...next[i], ...row, local: undefined }
  return next
}

export type Photo = { base64: string; mimeType?: string; fileName?: string; width?: number; height?: number; uri?: string }

export type SendInput = {
  body?: string
  photo?: Photo | null
  replyTo?: string | null
  kind?: "text" | "assistant"
  meta?: Record<string, unknown> | null
  id?: string
}

export function useChatThread(conversationId: string, meId: string | null) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [hasMore, setHasMore] = React.useState(false)
  const photos = React.useRef(new Map<string, Photo>())

  const markRead = React.useCallback(() => {
    if (AppState.currentState !== "active") return
    patchConversation(conversationId, { unread: 0 })
    chat.markRead(conversationId).catch(() => undefined)
  }, [conversationId])

  React.useEffect(() => {
    let alive = true
    setMessages([])
    setLoading(true)
    setError("")
    chat
      .messages(conversationId)
      .then((rows) => {
        if (!alive) return
        setMessages(rows)
        setHasMore(rows.length >= PAGE_SIZE)
        setLoading(false)
        markRead()
      })
      .catch((e: Error) => {
        if (!alive) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [conversationId, markRead])

  React.useEffect(
    () =>
      onChatChange((p) => {
        if (p.table !== "chat_messages") return
        const row = (p.new?.id ? p.new : p.old) as Partial<ChatMessage>
        if (!row || (row.conversation_id && row.conversation_id !== conversationId)) return
        if (p.eventType === "DELETE") {
          setMessages((list) => list.filter((m) => m.id !== p.old?.id))
          return
        }
        setMessages((list) => merge(list, p.new as ChatMessage))
        if (p.eventType === "INSERT" && (p.new as ChatMessage).sender_id !== meId) markRead()
      }),
    [conversationId, meId, markRead],
  )

  // Back from the background: read what arrived and catch up on anything missed.
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return
      chat.messages(conversationId).then((rows) => setMessages((list) => rows.reduce(merge, list))).catch(() => undefined)
      markRead()
    })
    return () => sub.remove()
  }, [conversationId, markRead])

  const loadOlder = React.useCallback(async () => {
    const first = messages.find((m) => !m.local)
    if (!first) return
    const rows = await chat.messages(conversationId, first.created_at)
    setHasMore(rows.length >= PAGE_SIZE)
    setMessages((list) => [...rows, ...list.filter((m) => !rows.some((r) => r.id === m.id))])
  }, [messages, conversationId])

  const send = React.useCallback(
    async ({ body = "", photo = null, replyTo = null, kind = "text", meta = null, id = newMessageId() }: SendInput) => {
      if (photo) photos.current.set(id, photo)
      const draft: ChatMessage = {
        id,
        conversation_id: conversationId,
        sender_id: meId,
        kind,
        body,
        reply_to: replyTo,
        meta,
        attachment: photo ? ({ name: photo.fileName, type: photo.mimeType || "image/jpeg", localUri: photo.uri, uploading: true, width: photo.width, height: photo.height } as ChatAttachment) : null,
        created_at: new Date().toISOString(),
        local: "pending",
      }
      setMessages((list) => merge(list, draft))
      try {
        const attachment = photo ? await chat.uploadPhoto(conversationId, photo) : null
        const saved = await chat.send({ id, conversationId, body, attachment, replyTo, kind, meta })
        photos.current.delete(id)
        setMessages((list) => merge(list, { ...saved, local: undefined }))
        return saved
      } catch (e) {
        setMessages((list) => list.map((m) => (m.id === id ? { ...m, local: "failed", error: (e as Error).message } : m)))
        throw e
      }
    },
    [conversationId, meId],
  )

  const retry = React.useCallback(
    (m: ChatMessage) => {
      setMessages((list) => list.filter((x) => x.id !== m.id))
      return send({ id: m.id, body: m.body || "", photo: photos.current.get(m.id) || null, replyTo: m.reply_to, kind: m.kind === "assistant" ? "assistant" : "text", meta: m.meta })
    },
    [send],
  )

  const discard = React.useCallback((m: ChatMessage) => {
    photos.current.delete(m.id)
    setMessages((list) => list.filter((x) => x.id !== m.id))
  }, [])

  return { messages, setMessages, loading, error, hasMore, loadOlder, send, retry, discard, markRead }
}

/** The signed-in user's id, for "is this mine". */
export function useMyId(): string | null {
  const [id, setId] = React.useState<string | null>(null)
  React.useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setId(data.session?.user?.id || null))
  }, [])
  return id
}
