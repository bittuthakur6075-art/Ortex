import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Send, X, Pencil, FileText } from "../../components/ui/Icons"
import { cn } from "../../lib/cn"
import { firstName, fileSize } from "../../lib/chat"
import { MAX_FILE_BYTES } from "../../services/chat"

// The message box: Enter sends, Shift+Enter is a new line, the paperclip (or a
// paste / drop) attaches a file, and a reply or an edit shows as a bar above.
export default function Composer({
  onSend, onEditSave, onTyping, replyTo, editing, onCancel, members, meId, disabled, placeholder = "Type a message", allowFiles = true,
}) {
  const [text, setText] = useState("")
  const [file, setFile] = useState(null)
  const areaRef = useRef(null)
  const fileRef = useRef(null)
  const preview = useMemo(() => (file?.type?.startsWith("image/") ? URL.createObjectURL(file) : ""), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  // Editing loads the message into the box; leaving edit mode empties it again.
  useEffect(() => {
    if (editing) setText(editing.body || "")
    else setText("")
    setFile(null)
    areaRef.current?.focus()
  }, [editing])

  useEffect(() => { if (replyTo) areaRef.current?.focus() }, [replyTo])

  // Grow with the text up to six lines.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const pick = (f) => {
    if (!f) return
    if (f.size > MAX_FILE_BYTES) return toast.error("Files can be up to 25 MB.")
    setFile(f)
    areaRef.current?.focus()
  }

  const submit = () => {
    const body = text.trim()
    if (disabled) return
    if (editing) {
      if (body && body !== editing.body) onEditSave(editing, body)
      else onCancel()
      return
    }
    if (!body && !file) return
    onSend({ body, file })
    setText("")
    setFile(null)
  }

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    } else if (e.key === "Escape" && (replyTo || editing)) {
      onCancel()
    }
  }

  const onPaste = (e) => {
    if (!allowFiles) return
    const f = [...(e.clipboardData?.files || [])][0]
    if (f) { e.preventDefault(); pick(f) }
  }

  const onDrop = (e) => {
    if (!allowFiles) return
    e.preventDefault()
    pick(e.dataTransfer?.files?.[0])
  }

  const bar = editing || replyTo
  return (
    <div className="flex-none border-t border-border bg-card px-4 py-3" onDragOver={(e) => allowFiles && e.preventDefault()} onDrop={onDrop}>
      {bar && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border-l-[3px] border-primary bg-well px-3 py-2">
          {editing ? <Pencil className="h-4 w-4 flex-none text-primary" /> : null}
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-primary">
              {editing ? "Editing message" : `Replying to ${replyTo.sender_id === meId ? "yourself" : firstName(members.get(replyTo.sender_id)?.name)}`}
            </p>
            {!editing && <p className="truncate text-muted-foreground">{replyTo.body || replyTo.attachment?.name || "Attachment"}</p>}
          </div>
          <button type="button" onClick={onCancel} className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground" aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {file && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-well px-3 py-2">
          {preview ? (
            <img src={preview} alt="" className="h-10 w-10 flex-none rounded-lg object-cover" />
          ) : (
            <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-card text-primary"><FileText className="h-5 w-5" /></span>
          )}
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-medium text-foreground">{file.name}</p>
            <p className="text-muted-foreground">{fileSize(file.size)} · add a caption or press Enter</p>
          </div>
          <button type="button" onClick={() => setFile(null)} className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground" aria-label="Remove file">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {allowFiles && !editing && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
              className="grid h-[45px] w-[45px] flex-none place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-primary disabled:opacity-50"
              aria-label="Attach a file"
              title="Attach a photo or file"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.4 11.1l-9.2 9.2a6 6 0 01-8.5-8.5l9.2-9.2a4 4 0 015.7 5.7l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5" /></svg>
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = "" }} />
          </>
        )}
        <textarea
          ref={areaRef}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => { setText(e.target.value); onTyping?.() }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={placeholder}
          aria-label="Message"
          className="squircle scroll-thin max-h-40 min-h-[45px] flex-1 resize-none rounded-[22px] border border-input bg-field px-4 py-[11px] text-sm leading-[22px] text-foreground placeholder:text-subtle-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || (!text.trim() && !file)}
          className={cn(
            "grid h-[45px] w-[45px] flex-none place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary-hover",
            "disabled:bg-muted disabled:text-subtle-foreground",
          )}
          aria-label={editing ? "Save edit" : "Send"}
          title={editing ? "Save (Enter)" : "Send (Enter)"}
        >
          <Send variant="Bold" className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
