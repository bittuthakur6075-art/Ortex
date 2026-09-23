import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { chat, onChatChange } from "../services/chat"
import { hasSupabase } from "../data/store/supabaseClient"
import { currentUserId, useAuth } from "../lib/auth"
import { onAutoRefresh } from "../data/store/autoRefresh"
import { sortInbox, totalUnread } from "../lib/chat"

/* ============================================================
   Team chat state.

   The INBOX is one module-level store shared by everything that reads it (the
   sidebar badge, the notifier, the chat page), so it is fetched once and kept
   live by the chat channel. A THREAD is per open conversation (useChatThread).
   ============================================================ */

let state = { list: [], loading: true, error: "", missing: false }
const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn())
const set = (patch) => { state = { ...state, ...patch }; emit() }

let loadTimer = 0
let inflight = null
let started = false
let activeConversation = null

export async function reloadInbox() {
  if (!hasSupabase || !currentUserId()) return
  if (inflight) return inflight
  inflight = chat.inbox()
    .then((list) => set({ list: sortInbox(list || []), loading: false, error: "", missing: false }))
    .catch((e) => set({ loading: false, error: e.message, missing: Boolean(e.missing) }))
    .finally(() => { inflight = null })
  return inflight
}

const reloadSoon = () => {
  clearTimeout(loadTimer)
  loadTimer = window.setTimeout(reloadInbox, 250)
}

function start() {
  if (started || !hasSupabase) return
  started = true
  onChatChange(reloadSoon)
  onAutoRefresh(reloadSoon)
}

export const getInbox = () => state.list

/** The conversation on screen, so the notifier does not toast what you are reading. */
export const setActiveConversation = (id) => { activeConversation = id }
export const getActiveConversation = () => activeConversation

export function useChatInbox() {
  const authed = useAuth()
  const snap = useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    () => state,
  )
  useEffect(() => {
    if (!authed) return
    start()
    reloadInbox()
  }, [authed])
  return { ...snap, unread: totalUnread(snap.list), reload: reloadInbox }
}

/** Patch one conversation locally (read counts drop the moment you open it). */
export function patchConversation(id, patch) {
  set({ list: state.list.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
}

// ---- one open thread ------------------------------------------------------------

const byTime = (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)

function merge(list, row) {
  const i = list.findIndex((m) => m.id === row.id)
  if (i === -1) return [...list, row].sort(byTime)
  const next = [...list]
  next[i] = { ...next[i], ...row, local: undefined }
  return next
}

export function useChatThread(conversationId) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [hasMore, setHasMore] = useState(false)
  const idRef = useRef(conversationId)
  idRef.current = conversationId

  const markRead = useCallback(() => {
    const id = idRef.current
    if (!id || document.visibilityState === "hidden") return
    patchConversation(id, { unread: 0 })
    chat.markRead(id).catch(() => {})
  }, [])

  // Load the latest page whenever the conversation changes.
  useEffect(() => {
    if (!conversationId) return
    let alive = true
    setMessages([])
    setLoading(true)
    setError("")
    chat.messages(conversationId)
      .then((rows) => {
        if (!alive) return
        setMessages(rows)
        setHasMore(rows.length >= 50)
        setLoading(false)
        markRead()
      })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false) } })
    return () => { alive = false }
  }, [conversationId, markRead])

  // Live: new, edited and deleted messages in this conversation.
  useEffect(() => {
    if (!conversationId) return
    return onChatChange((p) => {
      if (p.table !== "chat_messages") return
      const row = p.new?.id ? p.new : p.old
      if (!row || (row.conversation_id && row.conversation_id !== idRef.current)) return
      if (p.eventType === "DELETE") {
        setMessages((list) => list.filter((m) => m.id !== p.old?.id))
        return
      }
      setMessages((list) => merge(list, p.new))
      if (p.eventType === "INSERT" && p.new.sender_id !== currentUserId()) markRead()
    })
  }, [conversationId, markRead])

  // Coming back to the tab counts as reading what arrived meanwhile.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && markRead()
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [markRead])

  const loadOlder = useCallback(async () => {
    const first = messages.find((m) => !m.local)
    if (!first || !conversationId) return
    const rows = await chat.messages(conversationId, { before: first.created_at })
    setHasMore(rows.length >= 50)
    setMessages((list) => [...rows, ...list.filter((m) => !rows.some((r) => r.id === m.id))])
  }, [messages, conversationId])

  /** Optimistic send: the bubble appears at once and turns into the saved row. */
  const send = useCallback(async ({ body = "", file = null, replyTo = null, kind = "text", meta = null, id = crypto.randomUUID() }) => {
    const convId = idRef.current
    if (!convId) return null
    const draft = {
      id, conversation_id: convId, sender_id: currentUserId(), kind, body, reply_to: replyTo, meta,
      attachment: file ? { name: file.name, size: file.size, type: file.type, uploading: true, localUrl: file.type?.startsWith("image/") ? URL.createObjectURL(file) : "" } : null,
      created_at: new Date().toISOString(), local: "pending", file,
    }
    setMessages((list) => merge(list, draft))
    try {
      const attachment = file ? await chat.upload(convId, file) : null
      const saved = await chat.send({ id, conversationId: convId, body, attachment, replyTo, kind, meta })
      setMessages((list) => merge(list, { ...saved, local: undefined, file: undefined }))
      return saved
    } catch (e) {
      setMessages((list) => list.map((m) => (m.id === id ? { ...m, local: "failed", error: e.message } : m)))
      throw e
    }
  }, [])

  const retry = useCallback((message) => {
    setMessages((list) => list.filter((m) => m.id !== message.id))
    return send({ id: message.id, body: message.body, file: message.file || null, replyTo: message.reply_to, kind: message.kind, meta: message.meta })
  }, [send])

  const discard = useCallback((message) => setMessages((list) => list.filter((m) => m.id !== message.id)), [])

  /** Local-only row (Anu's thinking step, a failed reply), never saved. */
  const pushLocal = useCallback((row) => setMessages((list) => merge(list, row)), [])
  const dropLocal = useCallback((id) => setMessages((list) => list.filter((m) => m.id !== id)), [])

  return { messages, loading, error, hasMore, loadOlder, send, retry, discard, pushLocal, dropLocal, markRead, setMessages }
}
