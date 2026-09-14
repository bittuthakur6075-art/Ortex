import { useLayoutEffect, useRef, useState } from "react"
import { Textarea } from "./Ui"
import { cn } from "../../lib/cn"
import { afterChange, appendClause, lineKind, toggleBullets, toggleNumbered } from "../../lib/listText"

// A multi-line field for terms and conditions and notes, with list tools.
// The web port of Ortex.Mobile/src/ui/ListTextField.tsx.
//
// The text stays PLAIN (lib/listText.js explains why: it prints on the phone PDF
// and on DocumentSheet as the same characters). What the field adds is
// behaviour:
//
//   · a toolbar above the box: numbered list, bullets, "+ Clause", Undo, Clear
//     and a live character count;
//   · Enter on a list line continues it ("3." makes "4."), Enter on an empty
//     item ends the list, and numbered runs renumber themselves;
//   · Undo for the toolbar's own edits, so Clear is never a loss (the browser's
//     own Ctrl+Z cannot see a value React replaced).
//
// It composes the kit's Textarea rather than forking it, so `ai` still puts
// "Write with AI" in the corner. `onChange` receives the same event-shaped
// `{ target: { value } }` the kit's controls do.
export default function ListTextarea({ value = "", onChange, ai, className, maxLength, hint, ...props }) {
  const ref = useRef(null)
  const [history, setHistory] = useState([])
  const [caret, setCaret] = useState(null) // where to put the caret after the next render
  const [at, setAt] = useState(value.length) // caret position, to light the matching tool

  const emit = (text) => onChange?.({ target: { value: text } })

  useLayoutEffect(() => {
    if (caret === null || !ref.current) return
    const pos = Math.min(caret, ref.current.value.length)
    ref.current.setSelectionRange(pos, pos)
    setAt(pos)
    setCaret(null)
  }, [caret, value])

  const apply = (edit, undoable) => {
    if (undoable) setHistory((h) => [...h.slice(-19), value])
    emit(edit.text)
    if (edit.cursor >= 0) setCaret(edit.cursor)
  }

  const selection = () => {
    const el = ref.current
    return el ? [el.selectionStart, el.selectionEnd] : [value.length, value.length]
  }

  const handleChange = (e) => {
    const next = e.target.value
    const edit = afterChange(value, next)
    if (edit) apply(edit, false)
    else emit(next)
  }

  const trackCaret = (e) => setAt(e.target.selectionStart ?? 0)

  const kind = lineKind(value, Math.min(at, value.length))
  const disabled = props.disabled || props.readOnly

  // mousedown is prevented so the textarea keeps focus and its selection.
  const tool = (label, onPress, { active = false, title } = {}) => (
    <button
      type="button"
      title={title || label}
      aria-label={title || label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={cn(
        "inline-flex h-[30px] min-w-[36px] items-center justify-center rounded-btn px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        active ? "bg-primary/10 text-primary" : "text-secondary-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  )

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1">
        {tool("1.", () => { const [s, e] = selection(); apply(toggleNumbered(value, s, e), true) }, {
          active: kind === "numbered",
          title: kind === "numbered" ? "Remove numbering" : "Numbered list",
        })}
        {tool("•", () => { const [s, e] = selection(); apply(toggleBullets(value, s, e), true) }, {
          active: kind === "bulleted",
          title: kind === "bulleted" ? "Remove bullets" : "Bulleted list",
        })}
        {tool("+ Clause", () => apply(appendClause(value), true), { title: "Add a numbered clause" })}
        <span className="flex-1" />
        {history.length > 0 &&
          tool("Undo", () => {
            const prev = history[history.length - 1]
            setHistory((h) => h.slice(0, -1))
            emit(prev)
            setCaret(prev.length)
          })}
        {value.length > 0 && tool("Clear", () => apply({ text: "", cursor: 0 }, true), { title: "Clear all text" })}
        <span className="ml-1 text-xs tabular text-subtle-foreground">
          {value.length}
          {maxLength ? ` / ${maxLength}` : ""} chars
        </span>
      </div>
      <Textarea
        {...props}
        ref={ref}
        ai={ai ? { format: "lines", ...ai } : undefined}
        value={value}
        maxLength={maxLength}
        onChange={handleChange}
        onSelect={trackCaret}
        onKeyUp={trackCaret}
        onClick={trackCaret}
        className={className}
      />
      {hint && <p className="mt-1 text-xs text-subtle-foreground">{hint}</p>}
    </div>
  )
}
