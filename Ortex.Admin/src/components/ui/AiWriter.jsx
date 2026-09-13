import { useState } from "react"
import { Sparkles } from "./Icons"
import { Button, Chip, Input, Modal, Banner } from "./Ui"
import { aiWrite } from "../../services/ai"
import { cn } from "../../lib/cn"

// "Write with AI" for one text field.
//
// Opt-in on the kit: `<Textarea ai={{ purpose, context, format, maxChars }} />`
// renders this trigger inside the control. A form never calls ai-writer itself:
// it says what the field is FOR (`purpose`) and hands over the record around it
// (`context`, a function so it is read at the moment of asking, not at render).
//
// The result is a proposal, not an edit. Nothing reaches the field until the
// person presses "Use this" or "Insert below", and applying fires the field's own
// onChange with an event-shaped value, so the form's existing handler is all it
// takes.

const MODES = [
  { key: "write", label: "Write" },
  { key: "improve", label: "Improve", rewrite: true },
  { key: "shorten", label: "Shorten", rewrite: true },
  { key: "expand", label: "Expand", rewrite: true },
  { key: "formal", label: "Formal", rewrite: true },
  { key: "friendly", label: "Friendly", rewrite: true },
  { key: "fix", label: "Fix grammar", rewrite: true },
]

export default function AiWriter({ value, onApply, purpose, context, format, maxChars, label = "Write with AI", className }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState("write")
  const [instruction, setInstruction] = useState("")
  const [result, setResult] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const current = String(value ?? "")
  const hasText = current.trim().length > 0

  const openWith = () => {
    setMode(hasText ? "improve" : "write")
    setResult("")
    setError("")
    setOpen(true)
  }

  const generate = async () => {
    setBusy(true)
    setError("")
    const { text, error: err } = await aiWrite({
      purpose,
      mode,
      current,
      instruction: instruction.trim() || undefined,
      context: typeof context === "function" ? context() : context,
      format,
      maxChars,
    })
    setBusy(false)
    if (err) return setError(err)
    setResult(text)
  }

  const apply = (next) => {
    onApply(next)
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={openWith}
        className={className}
        title={label}
        aria-label={label}
      >
        <Sparkles className="h-3.5 w-3.5" /> AI
      </Button>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={label}
        width="max-w-xl"
        footer={
          result ? (
            <>
              <Button variant="ghost" onClick={generate} disabled={busy}>
                {busy ? "Writing…" : "Try again"}
              </Button>
              {hasText && (
                <Button variant="outline" onClick={() => apply(`${current.replace(/\s+$/, "")}\n\n${result}`)} disabled={busy}>
                  Insert below
                </Button>
              )}
              <Button onClick={() => apply(result)} disabled={busy}>
                Use this
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={generate} disabled={busy}>
                <Sparkles className="h-4 w-4" /> {busy ? "Writing…" : "Generate"}
              </Button>
            </>
          )
        }
      >
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground">{purpose}</p>

          <div className="flex flex-wrap gap-1">
            {MODES.map((m) => {
              const disabled = m.rewrite && !hasText
              return (
                <Chip
                  key={m.key}
                  active={mode === m.key}
                  onClick={() => !disabled && setMode(m.key)}
                  className={cn(disabled && "pointer-events-none opacity-40")}
                >
                  {m.label}
                </Chip>
              )
            })}
          </div>

          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Anything to add? For example: mention bulk orders, keep it under 50 words"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                if (!busy) generate()
              }
            }}
          />

          {error && <Banner tone="danger">{error}</Banner>}

          {result && (
            <div className="rounded-[16px] squircle border border-border bg-subtle px-3.5 py-3">
              <p className="mb-1.5 text-xs font-medium text-subtle-foreground">Suggestion</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{result}</p>
            </div>
          )}

          {!result && !error && (
            <p className="text-xs text-subtle-foreground">
              Review the suggestion before using it. The AI never adds prices, dates or specifications that are not already on this record.
            </p>
          )}
        </div>
      </Modal>
    </>
  )
}
