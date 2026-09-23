/**
 * Team chat against migrations 0045/0046 — the phone's port of the console's
 * Ortex.Admin/src/services/chat.js. Same RPCs, same members-only RLS, same
 * private `chat-files` bucket, so a message sent here is the same row the
 * console shows.
 *
 * Every write is an RPC (the tables have SELECT policies only). Realtime runs
 * on ONE channel of its own, "ortex-chat-mobile", with one binding per table,
 * all three of which are in the supabase_realtime publication (0045).
 *
 * Photos travel as base64, decoded here, for the reason productImages.ts gives:
 * a React Native Blob uploads 0 bytes without an error.
 */

import type { RealtimeChannel } from "@supabase/supabase-js"

import { hasSupabase, supabase } from "@/data/supabase"
import { attachmentPath, type ChatAttachment, type ChatMessage, type Conversation } from "@/domain/chat"
import { newPunchId } from "@/lib/attendance"
import { decodeBase64 } from "@/lib/avatarUpload"

export const CHAT_BUCKET = "chat-files"
export const PAGE_SIZE = 50
export const newMessageId = newPunchId

const MESSAGES: Record<string, string> = {
  not_member: "You are not in this conversation any more.",
  not_owner: "Only the group's admin can do that.",
  user_inactive: "That person's account is not active.",
  title_required: "Give the group a name.",
  cannot_edit: "Messages can only be edited for 15 minutes after sending.",
  cannot_delete: "That message cannot be deleted.",
  empty: "Type a message first.",
  bad_attachment: "That photo could not be attached.",
  not_staff: "Your account is not active.",
  admins_only: "Only admins can post to Everyone.",
  not_allowed: "That is not in your access.",
}

type PgError = { message?: string; code?: string; details?: string } | null

export function isMissing(error: PgError): boolean {
  const code = error?.code || ""
  const text = `${error?.message || ""} ${error?.details || ""}`
  return code === "PGRST202" || code === "42883" || code === "42P01" || /Could not find the function|does not exist/i.test(text)
}

export function chatError(error: PgError, fallback = "Something went wrong."): string {
  if (!error) return fallback
  if (isMissing(error)) return "Team chat is not set up on the server yet. Tell the office."
  for (const [key, text] of Object.entries(MESSAGES)) if (String(error.message || "").includes(key)) return text
  return error.message || fallback
}

export class ChatError extends Error {
  missing: boolean
  constructor(error: PgError) {
    super(chatError(error))
    this.missing = isMissing(error)
  }
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!hasSupabase) throw new Error("Not connected")
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new ChatError(error)
  return data as T
}

export type Person = { id: string; name: string | null; avatar_url: string | null; role: string }

export const chat = {
  inbox: () => rpc<Conversation[]>("chat_inbox"),
  people: () => rpc<Person[]>("chat_people"),
  openDirect: (userId: string) => rpc<string>("chat_open_direct", { p_user: userId }),
  openAssistant: () => rpc<string>("chat_open_assistant"),
  createGroup: (title: string, members: string[]) => rpc<string>("chat_create_group", { p_title: title, p_members: members }),
  leave: (id: string) => rpc<void>("chat_leave", { p_conversation: id }),
  markRead: (id: string) => rpc<void>("chat_mark_read", { p_conversation: id }),
  setMuted: (id: string, muted: boolean) => rpc<void>("chat_set_muted", { p_conversation: id, p_muted: muted }),
  clearAssistant: () => rpc<void>("chat_clear_assistant"),
  postToTeam: (team: string, body: string) => rpc<string>("chat_post_to_team", { p_team: team, p_body: body }),
  attendanceNow: (team: string | null) => rpc<string>("anu_attendance_now", { p_team: team }),
  teamUpdate: (team: string | null) => rpc<string>("anu_team_update", { p_team: team }),

  send: (m: { id: string; conversationId: string; body: string; attachment?: ChatAttachment | null; replyTo?: string | null; kind?: "text" | "assistant"; meta?: Record<string, unknown> | null }) =>
    rpc<ChatMessage>("chat_send", {
      p_id: m.id,
      p_conversation: m.conversationId,
      p_body: m.body || "",
      p_attachment: m.attachment || null,
      p_reply_to: m.replyTo || null,
      p_kind: m.kind || "text",
      p_meta: m.meta || null,
    }),

  async remove(messageId: string) {
    const path = await rpc<string | null>("chat_delete", { p_message: messageId })
    if (path) await supabase.storage.from(CHAT_BUCKET).remove([path]).catch(() => undefined)
  },

  /** Newest first from the database; returned oldest first for the thread. */
  async messages(conversationId: string, before?: string): Promise<ChatMessage[]> {
    let q = supabase.from("chat_messages").select("*").eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }).limit(PAGE_SIZE)
    if (before) q = q.lt("created_at", before)
    const { data, error } = await q
    if (error) throw new ChatError(error)
    return ((data || []) as ChatMessage[]).reverse()
  },

  /** Upload a picked photo (base64) into the conversation's folder. */
  async uploadPhoto(conversationId: string, photo: { base64: string; mimeType?: string; fileName?: string; width?: number; height?: number }): Promise<ChatAttachment> {
    const type = photo.mimeType && photo.mimeType.startsWith("image/") ? photo.mimeType : "image/jpeg"
    const name = photo.fileName || `photo-${Date.now()}.jpg`
    const path = attachmentPath(conversationId, name, newMessageId())
    const bytes = decodeBase64(photo.base64)
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const { error } = await supabase.storage.from(CHAT_BUCKET).upload(path, body, { contentType: type, upsert: false })
    if (error) throw new Error(/bucket not found/i.test(error.message) ? "Chat storage is not set up yet. Tell the office" : error.message)
    return { path, name, size: bytes.byteLength, type, width: photo.width, height: photo.height }
  },
}

// ---- signed URLs, cached until shortly before they expire ----------------------

const urlCache = new Map<string, { url: string; until: number }>()
const URL_TTL_S = 3600

export async function fileUrl(path: string): Promise<string> {
  const hit = urlCache.get(path)
  if (hit && hit.until > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, URL_TTL_S)
  if (error || !data?.signedUrl) throw new Error("File not available.")
  urlCache.set(path, { url: data.signedUrl, until: Date.now() + (URL_TTL_S - 120) * 1000 })
  return data.signedUrl
}

// ---- realtime: one channel, a listener set --------------------------------------

export type ChatChange = {
  table: string
  eventType: "INSERT" | "UPDATE" | "DELETE"
  new: Record<string, unknown>
  old: Record<string, unknown>
}

let channel: RealtimeChannel | null = null
const listeners = new Set<(p: ChatChange) => void>()

export function onChatChange(cb: (p: ChatChange) => void): () => void {
  if (!hasSupabase) return () => undefined
  listeners.add(cb)
  if (!channel) {
    const ch = supabase.channel("ortex-chat-mobile")
    for (const table of ["chat_messages", "chat_members", "chat_conversations"]) {
      ch.on("postgres_changes" as never, { event: "*", schema: "public", table } as never, (payload: ChatChange) => {
        listeners.forEach((fn) => fn(payload))
      })
    }
    ch.subscribe()
    channel = ch
  }
  return () => {
    listeners.delete(cb)
    if (!listeners.size && channel) {
      void supabase.removeChannel(channel)
      channel = null
    }
  }
}

/** Re-join after the app comes back from the background (sockets die there). */
export function rejoinChat() {
  if (!channel) return
  const keep = [...listeners]
  void supabase.removeChannel(channel)
  channel = null
  listeners.clear()
  keep.forEach((fn) => onChatChange(fn))
}
