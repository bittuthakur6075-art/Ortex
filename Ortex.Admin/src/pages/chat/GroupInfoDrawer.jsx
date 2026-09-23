import { useState } from "react"
import { toast } from "sonner"
import { Button, Drawer, Input, Badge } from "../../components/ui/Ui"
import { Plus, Pencil, LogOut, UserX } from "../../components/ui/Icons"
import { roleLabel } from "../../lib/roles"
import { chat } from "../../services/chat"
import { reloadInbox } from "../../hooks/useChat"
import { ConversationAvatar, PersonAvatar } from "./parts"
import NewChatModal from "./NewChatModal"

// A group's members and settings. Renaming, adding and removing are for the
// group's admin (its creator, or whoever inherited it); anyone may leave.
export default function GroupInfoDrawer({ open, onClose, conv, meId, presence, onLeft }) {
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState("")
  const [adding, setAdding] = useState(false)
  const owner = conv?.my_role === "owner"
  if (!conv) return null

  const run = async (fn, ok) => {
    try {
      await fn()
      if (ok) toast.success(ok)
      await reloadInbox()
      return true
    } catch (e) {
      toast.error(e.message)
      return false
    }
  }

  const saveTitle = async () => {
    if (await run(() => chat.rename(conv.id, title), "Group renamed")) setRenaming(false)
  }

  const leave = async () => {
    if (!window.confirm(`Leave "${conv.title}"? You will stop receiving its messages.`)) return
    if (await run(() => chat.leave(conv.id), "You left the group")) { onClose(); onLeft() }
  }

  const remove = (m) => {
    if (!window.confirm(`Remove ${m.name} from the group?`)) return
    run(() => chat.removeMember(conv.id, m.id), `${m.name} removed`)
  }

  return (
    <Drawer open={open} onClose={onClose} title="Group info" width="max-w-md">
      <div className="flex flex-col items-center text-center">
        <ConversationAvatar conv={conv} meId={meId} size="h-20 w-20" />
        {renaming ? (
          <div className="mt-3 flex w-full gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus onKeyDown={(e) => e.key === "Enter" && saveTitle()} />
            <Button onClick={saveTitle} disabled={!title.trim()}>Save</Button>
          </div>
        ) : (
          <h3 className="mt-3 flex items-center gap-2 text-lg font-semibold text-foreground">
            {conv.title}
            {owner && (
              <button type="button" onClick={() => { setTitle(conv.title || ""); setRenaming(true) }} className="text-muted-foreground hover:text-primary" aria-label="Rename group">
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </h3>
        )}
        <p className="mt-1 text-[13px] text-muted-foreground">Group · {conv.members.length} {conv.members.length === 1 ? "member" : "members"}</p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Members</h4>
        {owner && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add</Button>}
      </div>
      <div className="-mx-5 mt-2">
        {conv.members.map((m) => (
          <div key={m.id} className="group flex items-center gap-3 px-5 py-2.5">
            <PersonAvatar person={m} online={presence?.online.has(m.id)} size="h-10 w-10" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{m.id === meId ? "You" : m.name}</span>
              <span className="block text-xs text-muted-foreground">{roleLabel(m.role)}{m.active === false ? " · deactivated" : ""}</span>
            </span>
            {m.member_role === "owner" && <Badge tone="blue">Group admin</Badge>}
            {owner && m.id !== meId && (
              <button type="button" onClick={() => remove(m)} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${m.name}`} title="Remove from group">
                <UserX className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <Button variant="outline" className="w-full text-destructive" onClick={leave}>
          <LogOut className="h-4 w-4" /> Leave group
        </Button>
      </div>

      <NewChatModal
        open={adding}
        onClose={() => setAdding(false)}
        mode="add"
        presence={presence}
        exclude={conv.members.map((m) => m.id)}
        onAdd={(ids) => run(() => chat.addMembers(conv.id, ids), "Added to the group")}
        onOpened={() => {}}
      />
    </Drawer>
  )
}
