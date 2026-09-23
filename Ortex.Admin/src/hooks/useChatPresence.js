import { useCallback, useEffect, useRef, useSyncExternalStore } from "react"
import { supabase, hasSupabase } from "../data/store/supabaseClient"
import { currentUserId, useAuth } from "../lib/auth"

/* ============================================================
   Who is online, and who is typing where, over Supabase Realtime PRESENCE.

   One channel for the whole console, joined once per tab. A presence entry
   carries only a user id and the conversation being typed in, never message
   text, so nothing private travels this way. Typing clears itself after 4s of
   silence, as WhatsApp's does.
   ============================================================ */

const TYPING_TTL_MS = 4000

let channel = null
let snapshot = { online: new Set(), typing: new Map() } // typing: conversationId -> Set(userId)
const listeners = new Set()
let refs = 0
let myState = { typing: null }

function rebuild() {
  const online = new Set()
  const typing = new Map()
  const now = Date.now()
  for (const entries of Object.values(channel?.presenceState() || {})) {
    for (const e of entries) {
      if (!e.user_id) continue
      online.add(e.user_id)
      if (e.typing && now - (e.typing_at || 0) < TYPING_TTL_MS) {
        if (!typing.has(e.typing)) typing.set(e.typing, new Set())
        typing.get(e.typing).add(e.user_id)
      }
    }
  }
  snapshot = { online, typing }
  listeners.forEach((fn) => fn())
}

function join() {
  refs++
  if (channel || !hasSupabase) return
  const me = currentUserId()
  if (!me) return
  channel = supabase.channel("ortex-chat-presence", { config: { presence: { key: me } } })
  channel
    .on("presence", { event: "sync" }, rebuild)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") channel?.track({ user_id: me, typing: null })
    })
}

function leave() {
  refs = Math.max(0, refs - 1)
  if (refs || !channel) return
  supabase.removeChannel(channel)
  channel = null
  snapshot = { online: new Set(), typing: new Map() }
}

// Typing entries expire on the reader's side too, in case a "stopped" update is lost.
if (typeof window !== "undefined") window.setInterval(() => channel && snapshot.typing.size && rebuild(), 2000)

export function usePresence() {
  const authed = useAuth()
  useEffect(() => {
    if (!authed) return
    join()
    return leave
  }, [authed])
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => snapshot)
}

/** Call on every keystroke in a composer; throttled, and cleared after a pause. */
export function useTypingSignal(conversationId) {
  const lastSent = useRef(0)
  const clearTimer = useRef(0)

  const stop = useCallback(() => {
    clearTimeout(clearTimer.current)
    if (myState.typing && channel) {
      myState = { typing: null }
      channel.track({ user_id: currentUserId(), typing: null }).catch(() => {})
    }
    lastSent.current = 0
  }, [])

  const typing = useCallback(() => {
    if (!channel || !conversationId) return
    const now = Date.now()
    if (now - lastSent.current > 2500) {
      lastSent.current = now
      myState = { typing: conversationId }
      channel.track({ user_id: currentUserId(), typing: conversationId, typing_at: now }).catch(() => {})
    }
    clearTimeout(clearTimer.current)
    clearTimer.current = window.setTimeout(stop, TYPING_TTL_MS - 500)
  }, [conversationId, stop])

  useEffect(() => stop, [conversationId, stop])
  return { typing, stop }
}
