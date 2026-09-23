import { supabase, hasSupabase } from "../data/store/supabaseClient"
import { attachmentPath } from "../lib/chat"

// Team chat against migration 0045. Every write is an RPC (the tables have
// SELECT policies only); reads are plain selects under the members-only RLS.
// Realtime runs on ONE channel of its own, "ortex-chat", so a chat event never
// re-fetches the console's business collections (see apiStore.js).

export const CHAT_BUCKET = "chat-files"
export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const PAGE_SIZE = 50

const MESSAGES = {
  not_member: "You are not in this conversation any more.",
  not_owner: "Only the group's admin can do that.",
  user_inactive: "That person's account is not active.",
  title_required: "Give the group a name.",
  cannot_edit: "Messages can only be edited for 15 minutes after sending.",
  cannot_delete: "That message cannot be deleted.",
  empty: "Type a message first.",
  bad_attachment: "That file could not be attached.",
  not_staff: "Your account is not active.",
}

/** True when the error means migration 0045 has not been pushed. */
export function isMissing(error) {
  const code = error?.code || ""
  const text = `${error?.message || ""} ${error?.details || ""}`
  return code === "PGRST202" || code === "42883" || code === "42P01" || /Could not find the function|does not exist/i.test(text)
}

export function chatError(error, fallback = "Something went wrong.") {
  if (!error) return fallback
  if (isMissing(error)) return "Team chat needs database migration 0045. Ask an admin to push it."
  for (const [key, text] of Object.entries(MESSAGES)) if (String(error.message || "").includes(key)) return text
  return error.message || fallback
}

async function rpc(name, args) {
  if (!hasSupabase) throw new Error("Team chat needs the Supabase backend.")
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw Object.assign(new Error(chatError(error)), { code: error.code, missing: isMissing(error) })
  return data
}

export const chat = {
  inbox: () => rpc("chat_inbox"),
  people: () => rpc("chat_people"),
  openDirect: (userId) => rpc("chat_open_direct", { p_user: userId }),
  openAssistant: () => rpc("chat_open_assistant"),
  createGroup: (title, members) => rpc("chat_create_group", { p_title: title, p_members: members }),
  addMembers: (id, members) => rpc("chat_add_members", { p_conversation: id, p_members: members }),
  removeMember: (id, userId) => rpc("chat_remove_member", { p_conversation: id, p_user: userId }),
  rename: (id, title) => rpc("chat_rename", { p_conversation: id, p_title: title }),
  leave: (id) => rpc("chat_leave", { p_conversation: id }),
  markRead: (id) => rpc("chat_mark_read", { p_conversation: id }),
  setMuted: (id, muted) => rpc("chat_set_muted", { p_conversation: id, p_muted: muted }),
  edit: (messageId, body) => rpc("chat_edit", { p_message: messageId, p_body: body }),
  clearAssistant: () => rpc("chat_clear_assistant"),

  send: ({ id, conversationId, body, attachment = null, replyTo = null, kind = "text", meta = null }) =>
    rpc("chat_send", {
      p_id: id, p_conversation: conversationId, p_body: body || "", p_attachment: attachment,
      p_reply_to: replyTo, p_kind: kind, p_meta: meta,
    }),

  /** "Delete for everyone", then remove the file if it had one. */
  async remove(messageId) {
    const path = await rpc("chat_delete", { p_message: messageId })
    if (path) await supabase.storage.from(CHAT_BUCKET).remove([path]).catch(() => {})
  },

  /** Newest first from the database; returned oldest first for the thread. */
  async messages(conversationId, { before } = {}) {
    let q = supabase.from("chat_messages").select("*").eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }).limit(PAGE_SIZE)
    if (before) q = q.lt("created_at", before)
    const { data, error } = await q
    if (error) throw Object.assign(new Error(chatError(error)), { missing: isMissing(error) })
    return (data || []).reverse()
  },

  /** Upload a file into the conversation's folder; returns the attachment record. */
  async upload(conversationId, file) {
    if (file.size > MAX_FILE_BYTES) throw new Error("Files can be up to 25 MB.")
    const path = attachmentPath(conversationId, file.name, crypto.randomUUID())
    const { error } = await supabase.storage.from(CHAT_BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })
    if (error) throw new Error(/bucket not found/i.test(error.message) ? "The chat-files bucket is missing. Push migration 0045." : error.message)
    const att = { path, name: file.name, size: file.size, type: file.type || "application/octet-stream" }
    if (att.type.startsWith("image/")) Object.assign(att, await imageSize(file))
    return att
  },
}

function imageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url) }
    img.onerror = () => { resolve({}); URL.revokeObjectURL(url) }
    img.src = url
  })
}

// ---- signed URLs, cached until shortly before they expire ----------------------

const urlCache = new Map() // path -> { url, until }
const URL_TTL_S = 3600

export async function fileUrl(path) {
  const hit = urlCache.get(path)
  if (hit && hit.until > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, URL_TTL_S)
  if (error || !data?.signedUrl) throw new Error("File not available.")
  urlCache.set(path, { url: data.signedUrl, until: Date.now() + (URL_TTL_S - 120) * 1000 })
  return data.signedUrl
}

// ---- realtime: one channel, a listener set --------------------------------------

let channel = null
const listeners = new Set()

/** `cb({ table, eventType, new, old })` for every chat change this person may see. */
export function onChatChange(cb) {
  if (!hasSupabase) return () => {}
  listeners.add(cb)
  if (!channel) {
    channel = supabase.channel("ortex-chat")
    for (const table of ["chat_messages", "chat_members", "chat_conversations"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        listeners.forEach((fn) => fn(payload))
      })
    }
    channel.subscribe()
  }
  return () => {
    listeners.delete(cb)
    if (!listeners.size && channel) {
      supabase.removeChannel(channel)
      channel = null
    }
  }
}
