import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button, Input, Modal, SearchInput, Segmented, Field } from "../../components/ui/Ui"
import { cn } from "../../lib/cn"
import { roleLabel } from "../../lib/roles"
import { chat } from "../../services/chat"
import { PersonAvatar } from "./parts"

// Start a chat: one tap on a colleague opens (or creates) the direct chat;
// "New group" picks several and a name. `exclude` hides people already in a
// group when this is used to add members.
export default function NewChatModal({ open, onClose, onOpened, presence, mode: fixedMode, exclude = [], onAdd }) {
  const [mode, setMode] = useState("direct")
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState([])
  const [title, setTitle] = useState("")
  const [busy, setBusy] = useState(false)
  const effective = fixedMode || mode

  useEffect(() => {
    if (!open) return
    setQuery("")
    setPicked([])
    setTitle("")
    setMode("direct")
    setLoading(true)
    chat.people()
      .then((rows) => setPeople(rows || []))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [open])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people
      .filter((p) => !exclude.includes(p.id))
      .filter((p) => !q || `${p.name} ${roleLabel(p.role)}`.toLowerCase().includes(q))
  }, [people, query, exclude])

  const toggle = (id) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const openDirect = async (id) => {
    setBusy(true)
    try {
      onOpened(await chat.openDirect(id))
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const createGroup = async () => {
    if (!title.trim()) return toast.error("Give the group a name.")
    if (!picked.length) return toast.error("Pick at least one person.")
    setBusy(true)
    try {
      onOpened(await chat.createGroup(title.trim(), picked))
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    if (!picked.length) return
    setBusy(true)
    try {
      await onAdd(picked)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const multi = effective !== "direct"
  const footer = effective === "group"
    ? <Button onClick={createGroup} disabled={busy || !picked.length || !title.trim()}>Create group{picked.length ? ` (${picked.length + 1})` : ""}</Button>
    : effective === "add"
      ? <Button onClick={add} disabled={busy || !picked.length}>Add {picked.length || ""}</Button>
      : null

  return (
    <Modal open={open} onClose={onClose} title={effective === "add" ? "Add people" : "New chat"} footer={footer} width="max-w-md">
      {!fixedMode && (
        <Segmented
          className="mb-4"
          items={[{ value: "direct", label: "Message someone" }, { value: "group", label: "New group" }]}
          value={mode}
          onChange={(v) => { setMode(v); setPicked([]) }}
        />
      )}
      {effective === "group" && (
        <Field label="Group name" className="mb-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="For example: Dispatch team" autoFocus />
        </Field>
      )}
      <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search colleagues" className="mb-2" />
      <div className="-mx-5 max-h-[50vh] overflow-y-auto">
        {loading && <p className="px-5 py-6 text-center text-sm text-muted-foreground">Loading colleagues…</p>}
        {!loading && !shown.length && <p className="px-5 py-6 text-center text-sm text-muted-foreground">No colleagues found.</p>}
        {shown.map((p) => {
          const on = picked.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => (multi ? toggle(p.id) : openDirect(p.id))}
              className={cn("flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-subtle", on && "bg-primary/5")}
            >
              <PersonAvatar person={p} online={presence?.online.has(p.id)} size="h-10 w-10" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{p.name || "Unnamed"}</span>
                <span className="block text-xs text-muted-foreground">{roleLabel(p.role)}</span>
              </span>
              {multi && (
                <span className={cn("grid h-5 w-5 flex-none place-items-center rounded-full border", on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong")}>
                  {on && <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3 3 7-7" /></svg>}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
