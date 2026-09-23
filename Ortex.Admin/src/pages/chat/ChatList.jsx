import { useMemo, useState } from "react"
import { Button, Chip, ChipGroup, SearchInput } from "../../components/ui/Ui"
import { Pencil, MessageCircle, Bell } from "../../components/ui/Icons"
import { cn } from "../../lib/cn"
import { conversationTitle, inboxTime, previewText, searchConversations, tickState } from "../../lib/chat"
import { ConversationAvatar, Ticks } from "./parts"

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "groups", label: "Groups" },
]

// The left pane: every conversation, Anu pinned first, newest activity next.
export default function ChatList({ list, meId, activeId, onOpen, onNew, presence, loading }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  // Desktop alerts are opt-in: the browser asks once, and only after a click.
  const [permission, setPermission] = useState(() => ("Notification" in window ? Notification.permission : "denied"))
  const askPermission = () => Notification.requestPermission().then(setPermission).catch(() => {})

  const shown = useMemo(() => {
    let rows = searchConversations(list, query, meId)
    if (filter === "unread") rows = rows.filter((c) => c.unread > 0)
    if (filter === "groups") rows = rows.filter((c) => c.kind === "group")
    return rows
  }, [list, query, filter, meId])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center justify-between gap-2 px-5 pb-3 pt-5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Chats</h2>
        <Button size="sm" variant="outline" onClick={onNew} title="New chat or group">
          <Pencil className="h-4 w-4" /> New
        </Button>
      </div>
      <div className="flex-none space-y-3 px-5 pb-3">
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" />
        <ChipGroup>
          {FILTERS.map((f) => (
            <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>
          ))}
        </ChipGroup>
      </div>

      {permission === "default" && (
        <button type="button" onClick={askPermission} className="mx-5 mb-3 flex flex-none items-center gap-2 rounded-xl bg-primary/8 px-3 py-2 text-left text-xs text-primary hover:bg-primary/12">
          <Bell className="h-4 w-4 flex-none" /> Get desktop alerts for new messages while the console is in the background
        </button>
      )}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto border-t border-border">
        {loading && !list.length && <ListSkeleton />}
        {!loading && !shown.length && (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <MessageCircle className="mb-3 h-8 w-8 text-subtle-foreground" />
            <p className="text-sm font-medium text-foreground">{query || filter !== "all" ? "No chats match" : "No chats yet"}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">{query || filter !== "all" ? "Try another search or filter." : "Start one with a colleague, or make a group."}</p>
          </div>
        )}
        {shown.map((c) => {
          const last = c.last_message
          const mineLast = last && last.sender_id === meId && last.kind === "text" && !last.deleted
          const typingHere = presence?.typing.get(c.id)
          const typers = typingHere ? [...typingHere].filter((id) => id !== meId) : []
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpen(c.id)}
              className={cn(
                "flex w-full items-center gap-3 border-b border-border px-5 py-3 text-left transition-colors",
                activeId === c.id ? "bg-primary/8" : "hover:bg-subtle",
              )}
            >
              <ConversationAvatar conv={c} meId={meId} online={presence?.online} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{conversationTitle(c, meId)}</span>
                  <span className={cn("ml-auto flex-none text-[11px]", c.unread > 0 && !c.muted ? "font-semibold text-primary" : "text-muted-foreground")}>
                    {inboxTime(last?.created_at || (c.kind === "assistant" ? null : c.activity_at))}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  {typers.length > 0 ? (
                    <span className="truncate text-[13px] font-medium text-success-text">typing…</span>
                  ) : (
                    <>
                      {mineLast && <Ticks state={tickState(last, c, meId)} className="flex-none text-muted-foreground" />}
                      <span className="truncate text-[13px] text-muted-foreground">{previewText(c, meId)}</span>
                    </>
                  )}
                  {c.muted && <span className="ml-auto flex-none text-[11px] text-subtle-foreground">Muted</span>}
                  {c.unread > 0 && (
                    <span className={cn("ml-auto grid h-5 min-w-5 flex-none place-items-center rounded-full px-1.5 text-[11px] font-semibold", c.muted ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")}>
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  )}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div>
      {[70, 55, 80, 60, 45].map((w, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-5 py-3">
          <span className="h-11 w-11 flex-none animate-pulse rounded-full bg-muted" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
            <span className="block h-3 w-4/5 animate-pulse rounded bg-muted/70" />
          </span>
        </div>
      ))}
    </div>
  )
}
