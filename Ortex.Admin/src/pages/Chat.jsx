import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Card, EmptyState } from "../components/ui/Ui"
import { MessageCircle, AlertTriangle } from "../components/ui/Icons"
import { useProfile } from "../hooks/useProfile"
import { useChatInbox, reloadInbox, setActiveConversation } from "../hooks/useChat"
import { usePresence } from "../hooks/useChatPresence"
import { hasSupabase } from "../data/store/supabaseClient"
import { currentUserId } from "../lib/auth"
import { cn } from "../lib/cn"
import { chat } from "../services/chat"
import ChatList from "./chat/ChatList"
import Thread from "./chat/Thread"
import NewChatModal from "./chat/NewChatModal"
import GroupInfoDrawer from "./chat/GroupInfoDrawer"

/* ============================================================
   Team chat (/chat): WhatsApp for the team, inside the console.

   Left, every conversation with Anu pinned first; right, the open thread.
   On a narrow screen one pane shows at a time. The open conversation lives in
   the URL (?c=<id>), so a link can open it and Back works; ?with=<user id>
   opens (or creates) the direct chat with that person.

   Private by design (migration 0045): only a conversation's members can read
   it, admins included. Anu's thread is the person's own.
   ============================================================ */

export default function Chat() {
  const profile = useProfile()
  const meId = currentUserId()
  const inbox = useChatInbox()
  const presence = usePresence()
  const [params, setParams] = useSearchParams()
  const [newOpen, setNewOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const activeId = params.get("c")

  const open = useCallback((id) => {
    setParams(id ? { c: id } : {}, { replace: false })
    setInfoOpen(false)
  }, [setParams])

  // Make sure Anu's thread exists, so it is always pinned at the top.
  useEffect(() => {
    if (!hasSupabase || inbox.loading || inbox.missing) return
    if (!inbox.list.some((c) => c.kind === "assistant")) chat.openAssistant().then(reloadInbox).catch(() => {})
  }, [inbox.loading, inbox.missing, inbox.list])

  // ?with=<user> opens the direct chat with that colleague.
  useEffect(() => {
    const withUser = params.get("with")
    if (!withUser) return
    chat.openDirect(withUser)
      .then(async (id) => { await reloadInbox(); open(id) })
      .catch((e) => { toast.error(e.message); setParams({}) })
  }, [params, open, setParams])

  // The notifier stays quiet about the conversation on screen.
  useEffect(() => {
    setActiveConversation(activeId)
    return () => setActiveConversation(null)
  }, [activeId])

  const active = useMemo(() => inbox.list.find((c) => c.id === activeId) || null, [inbox.list, activeId])

  const opened = async (id) => {
    await reloadInbox()
    open(id)
  }

  if (!hasSupabase) {
    return <EmptyState icon={MessageCircle} title="Team chat needs the database" description="Chat runs on Supabase. This console is in offline demo mode." />
  }
  if (inbox.missing) {
    return <EmptyState icon={AlertTriangle} title="Team chat is not set up yet" description="Database migration 0045 (team chat) has not been pushed to this project. Ask an admin to run supabase db push." />
  }

  return (
    <Card className="h-[calc(100dvh-70px-40px)] min-h-[520px] flex-row overflow-hidden">
      <div className={cn("h-full w-full min-w-0 border-r border-border lg:w-[360px] lg:flex-none", active ? "hidden lg:block" : "block")}>
        <ChatList
          list={inbox.list}
          meId={meId}
          activeId={activeId}
          onOpen={open}
          onNew={() => setNewOpen(true)}
          presence={presence}
          loading={inbox.loading}
        />
      </div>
      <div className={cn("h-full min-w-0 flex-1", active ? "block" : "hidden lg:block")}>
        {active ? (
          <Thread
            key={active.id}
            conv={active}
            meId={meId}
            profile={profile}
            presence={presence}
            onBack={() => open(null)}
            onInfo={() => setInfoOpen(true)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-subtle px-6 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
              <MessageCircle className="h-8 w-8" />
            </span>
            <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Team chat</h2>
            <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">
              Message a colleague, make a group for a job, or ask Anu for today's briefing, a lookup or help with the console.
              Chats are private to the people in them.
            </p>
            {inbox.error && <p className="mt-3 text-[13px] text-destructive-text">{inbox.error}</p>}
          </div>
        )}
      </div>

      <NewChatModal open={newOpen} onClose={() => setNewOpen(false)} onOpened={opened} presence={presence} />
      <GroupInfoDrawer open={infoOpen && active?.kind === "group"} onClose={() => setInfoOpen(false)} conv={active} meId={meId} presence={presence} onLeft={() => open(null)} />
    </Card>
  )
}
