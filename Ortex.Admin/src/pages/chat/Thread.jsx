import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "../../components/ui/Ui"
import { ArrowLeft, Info, Bell, Trash2, Sparkles, AlertTriangle } from "../../components/ui/Icons"
import { cn } from "../../lib/cn"
import { conversationTitle, firstName, memberLine, peerOf, threadSections } from "../../lib/chat"
import { useChatThread, patchConversation } from "../../hooks/useChat"
import { useTypingSignal } from "../../hooks/useChatPresence"
import { useAssistantChat } from "../../components/chat/useAssistantChat"
import { chat } from "../../services/chat"
import { ConversationAvatar, ANU_PHOTO } from "./parts"
import MessageBubble from "./MessageBubble"
import Composer from "./Composer"

const ANU_SUGGESTIONS = [
  "What needs my attention today?",
  "What's new in the console?",
  "How do I create a quotation?",
  "How are sales this month?",
]

export default function Thread({ conv, meId, profile, presence, onBack, onInfo }) {
  const thread = useChatThread(conv.id)
  const isAnu = conv.kind === "assistant"
  const assistant = useAssistantChat({ profile, thread })
  const { typing, stop } = useTypingSignal(isAnu ? null : conv.id)
  const [replyTo, setReplyTo] = useState(null)
  const [editing, setEditing] = useState(null)
  const scroller = useRef(null)
  const atBottom = useRef(true)
  const prevHeight = useRef(0)

  const members = useMemo(() => new Map((conv.members || []).map((m) => [m.id, m])), [conv.members])
  const sections = useMemo(() => threadSections(thread.messages), [thread.messages])
  const byId = useMemo(() => new Map(thread.messages.map((m) => [m.id, m])), [thread.messages])

  useEffect(() => { setReplyTo(null); setEditing(null); atBottom.current = true }, [conv.id])

  // Stick to the bottom as messages arrive, unless the reader has scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (prevHeight.current && !atBottom.current && el.scrollHeight > prevHeight.current && el.scrollTop < 40) {
      el.scrollTop = el.scrollHeight - prevHeight.current // older page loaded above: keep position
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight
    }
    prevHeight.current = el.scrollHeight
  }, [thread.messages, assistant.thinking, assistant.steps])

  const onScroll = async () => {
    const el = scroller.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (el.scrollTop < 40 && thread.hasMore && !thread.loading) {
      prevHeight.current = el.scrollHeight
      await thread.loadOlder().catch(() => {})
    }
  }

  const send = async ({ body, file }) => {
    atBottom.current = true
    stop()
    if (isAnu) return assistant.ask(body)
    const reply = replyTo
    setReplyTo(null)
    try {
      await thread.send({ body, file, replyTo: reply?.id || null })
    } catch { /* shown on the bubble with Retry */ }
  }

  const saveEdit = async (m, body) => {
    setEditing(null)
    try {
      await chat.edit(m.id, body)
      thread.setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, body, edited_at: new Date().toISOString() } : x)))
    } catch (e) {
      toast.error(e.message)
    }
  }

  const remove = async (m) => {
    if (!window.confirm("Delete this message for everyone?")) return
    try {
      await chat.remove(m.id)
      thread.setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, body: null, attachment: null, meta: null, deleted_at: new Date().toISOString() } : x)))
    } catch (e) {
      toast.error(e.message)
    }
  }

  const toggleMute = async () => {
    const muted = !conv.muted
    patchConversation(conv.id, { muted })
    try { await chat.setMuted(conv.id, muted) } catch (e) { patchConversation(conv.id, { muted: !muted }); toast.error(e.message) }
  }

  const clearAnu = async () => {
    if (!window.confirm("Clear your conversation with Anu? This cannot be undone.")) return
    try {
      await chat.clearAssistant()
      thread.setMessages([])
    } catch (e) {
      toast.error(e.message)
    }
  }

  // Header subtitle: typing beats online beats the member list.
  const typers = [...(presence?.typing.get(conv.id) || [])].filter((id) => id !== meId)
  const peer = peerOf(conv, meId)
  const subtitle = isAnu
    ? "AI assistant · answers from your own data"
    : typers.length
      ? conv.kind === "group" ? `${typers.map((id) => firstName(members.get(id)?.name)).join(", ")} typing…` : "typing…"
      : conv.kind === "group"
        ? memberLine(conv, meId)
        : peer && presence?.online.has(peer.id) ? "Online" : peer?.active === false ? "Account deactivated" : "Offline"

  const empty = !thread.loading && !thread.messages.length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-[70px] flex-none items-center gap-3 border-b border-border bg-card px-4">
        <button type="button" onClick={onBack} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-accent lg:hidden" aria-label="Back to chats">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={conv.kind === "group" ? onInfo : undefined} className={cn("flex min-w-0 flex-1 items-center gap-3 text-left", conv.kind !== "group" && "cursor-default")}>
          <ConversationAvatar conv={conv} meId={meId} online={presence?.online} size="h-10 w-10" />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-foreground">{conversationTitle(conv, meId)}</span>
            <span className={cn("block truncate text-xs", typers.length ? "font-medium text-success-text" : "text-muted-foreground")}>{subtitle}</span>
          </span>
        </button>
        <div className="flex flex-none items-center gap-1">
          {!isAnu && (
            <button type="button" onClick={toggleMute} className={cn("grid h-9 w-9 place-items-center rounded-full hover:bg-accent", conv.muted ? "text-warning-text" : "text-muted-foreground")} title={conv.muted ? "Unmute notifications" : "Mute notifications"} aria-label={conv.muted ? "Unmute" : "Mute"}>
              <Bell className="h-5 w-5" />
            </button>
          )}
          {conv.kind === "group" && (
            <button type="button" onClick={onInfo} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-accent" title="Group info" aria-label="Group info">
              <Info className="h-5 w-5" />
            </button>
          )}
          {isAnu && thread.messages.length > 0 && (
            <button type="button" onClick={clearAnu} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive" title="Clear conversation" aria-label="Clear conversation">
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      <div ref={scroller} onScroll={onScroll} className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-subtle px-4 py-3 sm:px-6">
        {thread.loading && <ThreadSkeleton />}
        {thread.error && <p className="py-10 text-center text-sm text-destructive-text">{thread.error}</p>}
        {thread.hasMore && !thread.loading && (
          <div className="flex justify-center py-2">
            <Button size="sm" variant="outline" onClick={() => thread.loadOlder().catch(() => {})}>Load earlier messages</Button>
          </div>
        )}

        {empty && isAnu && <AnuWelcome name={firstName(profile?.name)} onAsk={(q) => send({ body: q })} disabled={assistant.thinking} />}
        {empty && !isAnu && (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center">
            <ConversationAvatar conv={conv} meId={meId} online={presence?.online} size="h-16 w-16" />
            <p className="mt-3 text-sm font-medium text-foreground">{conversationTitle(conv, meId)}</p>
            <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">Say hello. Messages here are visible only to the people in this chat.</p>
          </div>
        )}

        {sections.map((s) => (
          <section key={s.key}>
            <div className="sticky top-0 z-[1] flex justify-center py-2">
              <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">{s.label}</span>
            </div>
            {s.items.map((item) => (
              <MessageBubble
                key={item.message.id}
                item={item}
                conv={conv}
                meId={meId}
                members={members}
                replied={item.message.reply_to ? byId.get(item.message.reply_to) : null}
                onReply={(m) => { setEditing(null); setReplyTo(m) }}
                onEdit={(m) => { setReplyTo(null); setEditing(m) }}
                onDelete={remove}
                onRetry={(m) => thread.retry(m).catch(() => {})}
                onDiscard={thread.discard}
              />
            ))}
          </section>
        ))}

        {isAnu && assistant.thinking && <AnuThinking steps={assistant.steps} />}
        {isAnu && assistant.error && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-destructive/10 px-3.5 py-2.5 text-[13px] text-destructive-text">
            <AlertTriangle className="mt-px h-4 w-4 flex-none" />
            <span className="flex-1">{assistant.error}</span>
            <button type="button" onClick={assistant.clearError} className="font-semibold hover:underline">Dismiss</button>
          </div>
        )}
      </div>

      <Composer
        key={conv.id}
        onSend={send}
        onEditSave={saveEdit}
        onTyping={typing}
        replyTo={replyTo}
        editing={editing}
        onCancel={() => { setReplyTo(null); setEditing(null) }}
        members={members}
        meId={meId}
        disabled={isAnu && assistant.thinking}
        allowFiles={!isAnu}
        placeholder={isAnu ? "Ask Anu about leads, quotations, or how to do something" : conv.kind === "direct" && peer?.active === false ? "This account is deactivated" : "Type a message"}
      />
    </div>
  )
}

function AnuWelcome({ name, onAsk, disabled }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-10 text-center">
      <img src={ANU_PHOTO} alt="Anu" className="h-20 w-20 rounded-full object-cover" />
      <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Namaste {name}, I'm Anu</h3>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        Ask me about your leads, quotations, customers and products, how to do something in the console, or what's new. I only read your data; I never change it from here.
      </p>
      <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
        {ANU_SUGGESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onAsk(q)}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-3 text-left text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4 flex-none text-primary" /> {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function AnuThinking({ steps }) {
  return (
    <div className="mt-3 flex items-end gap-2">
      <div className="rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2.5">
        <div className="flex items-center gap-1" aria-label="Anu is thinking">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
        {steps.map((s, i) => (
          <p key={i} className="mt-1.5 text-xs text-muted-foreground animate-row-in">{s}</p>
        ))}
      </div>
    </div>
  )
}

function ThreadSkeleton() {
  return (
    <div className="space-y-3 py-4">
      {[["w-2/5", false], ["w-1/3", true], ["w-1/2", false], ["w-1/4", true]].map(([w, mine], i) => (
        <div key={i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
          <span className={cn("block h-10 animate-pulse rounded-2xl", w, mine ? "bg-primary/15" : "bg-card")} />
        </div>
      ))}
    </div>
  )
}
