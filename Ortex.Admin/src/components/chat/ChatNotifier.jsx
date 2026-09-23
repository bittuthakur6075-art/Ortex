import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { onChatChange } from "../../services/chat"
import { getActiveConversation, getInbox, reloadInbox, useChatInbox } from "../../hooks/useChat"
import { currentUserId } from "../../lib/auth"
import { conversationTitle, firstName, oneLine } from "../../lib/chat"

// Mounted once in AdminLayout. A message from someone else in a chat that is
// not on screen (and not muted) raises a toast, or a desktop notification when
// the tab is in the background and the person allowed them. The tab title
// carries the unread count, as WhatsApp Web's does.
export default function ChatNotifier() {
  const navigate = useNavigate()
  const { unread } = useChatInbox()
  const baseTitle = useRef(typeof document !== "undefined" ? document.title.replace(/^\(\d+\+?\)\s*/, "") : "")

  useEffect(() => {
    document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${baseTitle.current}` : baseTitle.current
  }, [unread])

  useEffect(() => onChatChange(async (p) => {
    if (p.table !== "chat_messages" || p.eventType !== "INSERT") return
    const m = p.new
    const me = currentUserId()
    if (!m || m.sender_id === me || m.kind !== "text") return
    const hidden = document.visibilityState === "hidden"
    if (!hidden && getActiveConversation() === m.conversation_id) return

    let conv = getInbox().find((c) => c.id === m.conversation_id)
    if (!conv) { await reloadInbox(); conv = getInbox().find((c) => c.id === m.conversation_id) }
    if (!conv || conv.muted) return

    const sender = conv.members?.find((x) => x.id === m.sender_id)
    const title = conv.kind === "group" ? `${firstName(sender?.name)} in ${conversationTitle(conv, me)}` : conversationTitle(conv, me)
    const body = m.body ? oneLine(m.body).slice(0, 140) : m.attachment ? "Sent a file" : ""
    const go = () => navigate(`/chat?c=${m.conversation_id}`)

    if (hidden && "Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, { body, icon: sender?.avatar_url || "/icons/app-icon-192.png", tag: `chat-${m.conversation_id}` })
      n.onclick = () => { window.focus(); go(); n.close() }
      return
    }
    toast(title, { description: body, action: { label: "Open", onClick: go } })
  }), [navigate])

  return null
}
