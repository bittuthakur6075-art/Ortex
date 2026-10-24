import { useRef, useState } from "react"
import { Markdown } from "../lib/markdown"

const SUGGESTIONS = [
  "Satyanarayan pooja ka sankalp kaise karein?",
  "What can I use if I don't have a Shaligram?",
  "Maithil vidhi mein pooja kis disha mein baith kar karein?",
  "Why is tulsi needed in the prasad?",
]

export default function AskChat({ pooja }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const listRef = useRef(null)

  async function send(text) {
    const question = text.trim()
    if (!question || busy) return
    const history = [...messages, { role: "user", content: question }]
    setMessages([...history, { role: "assistant", content: "" }])
    setInput("")
    setBusy(true)
    const append = (chunk) =>
      setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: prev.at(-1).content + chunk }])
    let got = ""
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pooja: pooja.id, messages: history.slice(-19) }),
      })
      if (!r.ok || !r.body) {
        got = (await r.text().catch(() => "")) || "Pandit Ji is not available right now."
        append(got)
      } else {
        const reader = r.body.getReader()
        const decoder = new TextDecoder()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          got += chunk
          append(chunk)
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
        }
      }
    } catch {
      got = "Could not reach Pandit Ji. Please check your internet connection."
      append(got)
    }
    // An empty answer would be rejected as history on the next question.
    if (!got.trim()) append("Kshama karein, please ask that once more.")
    setBusy(false)
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div ref={listRef} className="max-h-[60vh] min-h-64 space-y-4 overflow-y-auto p-6" aria-live="polite">
        {messages.length === 0 && (
          <div>
            <p className="text-[16px] text-foreground/80">
              Ask Pandit Ji anything: the vidhi, a mantra, samagri, timing, the katha, or the meaning behind any ritual.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="btn btn-outline rounded-full py-2 text-left font-medium">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex gap-3"}>
            {m.role === "assistant" && <span className="deva mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm text-primary-foreground">ॐ</span>}
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${m.role === "user" ? "bg-foreground text-background" : "bg-secondary"}`}>
              {m.role === "user" ? m.content : m.content ? <Markdown text={m.content} /> : <span className="text-muted-foreground">Pandit Ji is answering...</span>}
            </div>
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          aria-label="Your question"
          placeholder="Type in Maithili, Hindi or English"
          className="flex-1 rounded-xl border bg-background px-4 py-2.5 text-[15px] outline-none focus:border-primary"
        />
        <button disabled={busy || !input.trim()} className="btn btn-primary">Ask</button>
      </form>
    </div>
  )
}
