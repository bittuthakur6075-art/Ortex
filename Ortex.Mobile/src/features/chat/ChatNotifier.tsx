/**
 * Team chat notifications on the phone. Renders nothing; mounted once in
 * RootNavigator while someone is signed in.
 *
 * A new message from someone else (or Anu's team post) reaches the shade AT
 * ONCE over the chat realtime channel, whether the app is open on another
 * screen or sitting in the background, unless:
 *   - it is the conversation on screen right now, with the app in front;
 *   - the chat is muted (chat_members.muted, the same flag the console sets);
 *   - the person turned "Team chat" or all notifications off in Settings.
 *
 * This is LOCAL: it needs the app's process alive. A phone whose app was
 * swiped away is reached by the server's FCM push instead (push-notify,
 * migration 0047), sent with the same `chat-<conversation>` tag so the two
 * copies replace each other rather than stack.
 */

import React from "react"
import { AppState } from "react-native"

import { conversationTitle, firstName, isImage, oneLine, type ChatMessage } from "@/domain/chat"
import { getActiveConversation, getInbox, reloadInbox, useChatInbox, useMyId } from "@/features/chat/useChat"
import { onChatChange } from "@/lib/chat"
import { hydrateNotifications, notificationPrefs } from "@/lib/notificationStore"
import { dismissChatNotification, presentChatNotification, pushPermissionGranted } from "@/lib/push"

export function ChatNotifier() {
  const meId = useMyId()
  // Keeps the inbox store started and live, so muted flags and names are known.
  useChatInbox()
  const meRef = React.useRef(meId)
  meRef.current = meId

  React.useEffect(
    () =>
      onChatChange(async (p) => {
        if (p.table !== "chat_messages" || p.eventType !== "INSERT") return
        const m = p.new as unknown as ChatMessage
        const me = meRef.current
        if (!m?.id || !me || m.sender_id === me || (m.kind !== "text" && m.kind !== "bot")) return

        const inFront = AppState.currentState === "active"
        if (inFront && getActiveConversation() === m.conversation_id) return

        await hydrateNotifications()
        const prefs = notificationPrefs()
        if (!prefs.enabled || prefs.chat === false) return

        let conv = getInbox().find((c) => c.id === m.conversation_id)
        if (!conv) {
          await reloadInbox()
          conv = getInbox().find((c) => c.id === m.conversation_id)
        }
        if (!conv || conv.muted) return
        if (!(await pushPermissionGranted())) return

        const senderName =
          m.kind === "bot"
            ? "Anu"
            : conv.members.find((x) => x.id === m.sender_id)?.name || (m.meta?.sender_name as string | undefined) || "Someone"
        const title =
          conv.kind === "group" || conv.kind === "team"
            ? `${firstName(senderName)} in ${conversationTitle(conv, me)}`
            : conversationTitle(conv, me)
        const body = m.body ? oneLine(m.body).slice(0, 240) : isImage(m.attachment) ? "Photo" : m.attachment ? "Sent a file" : "New message"

        await presentChatNotification({ conversationId: m.conversation_id, messageId: m.id, title, body }).catch(() => undefined)
      }),
    [],
  )

  return null
}

/** Clears a chat's notification while its thread is on screen. */
export function useDismissChatNotification(conversationId: string) {
  React.useEffect(() => {
    void dismissChatNotification(conversationId)
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void dismissChatNotification(conversationId)
    })
    return () => sub.remove()
  }, [conversationId])
}
