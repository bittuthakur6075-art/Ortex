import { useCallback, useMemo, useRef, useState } from "react"
import { supabase, functionErrorMessage } from "../../data/store/supabaseClient"
import { canAccess } from "../../data/domain/modules"
import { cardFor } from "../../lib/anu"
import { accessFor, runReadTool } from "../anu/readTools"
import { CHAT_TOOLS, chatInstruction, helpFor, whatsNew } from "./assistant"

/* ============================================================
   Anu's side of the Anu thread in Team chat.

   One question = one loop: the person's message is saved to the thread, the
   recent conversation goes to the `anu-chat` function, and each functionCall
   it returns runs HERE, under the person's own session (readTools.js, the same
   lookups voice Anu uses), until Gemini answers in text. That answer is saved
   to the thread as kind 'assistant' with the records it found as cards.

   Only the text of earlier turns is replayed as history; tool results are
   re-fetched when needed, which keeps every figure current.
   ============================================================ */

const MAX_ROUNDS = 5
const HISTORY_TURNS = 20

const STEP = {
  get_briefing: () => "Checked today's briefing",
  find_customers: (a) => `Searched customers${a.query ? ` for "${a.query}"` : ""}`,
  find_enquiries: (a) => `Searched leads${a.query ? ` for "${a.query}"` : ""}`,
  find_quotations: (a) => `Searched quotations${a.query ? ` for "${a.query}"` : ""}`,
  get_quotation: () => "Read a quotation",
  find_products: (a) => `Searched the catalogue${a.query ? ` for "${a.query}"` : ""}`,
  sales_summary: (a) => `Summarised the last ${a.days || 30} days`,
  console_help: () => "Looked up help",
  whats_new: () => "Checked what's new",
}

async function callModel(system, contents) {
  const { data, error } = await supabase.functions.invoke("anu-chat", { body: { system, contents, tools: CHAT_TOOLS } })
  if (error) {
    const status = error?.context?.status
    if (status === 404 || /failed to send a request/i.test(error?.message || "")) {
      throw new Error("Anu's chat service is not deployed yet. Ask an admin to deploy the anu-chat function.")
    }
    throw new Error(await functionErrorMessage(error, "Anu could not answer. Try again."))
  }
  return data?.parts || []
}

export function useAssistantChat({ profile, thread }) {
  const [thinking, setThinking] = useState(false)
  const [steps, setSteps] = useState([])
  const [error, setError] = useState("")
  const busy = useRef(false)
  const access = useMemo(() => accessFor(canAccess, profile), [profile])

  const runTool = useCallback(async (name, args) => {
    if (name === "console_help") {
      const res = helpFor(args.topic, profile)
      const cards = res.articles.map((a) => ({ key: `page:${a.page}:${a.title}`, kind: "page", id: a.page, to: a.page, title: a.title, subtitle: "Open the page" }))
      return { response: res, cards }
    }
    if (name === "whats_new") {
      const res = whatsNew(args.releases)
      return { response: res, cards: [{ key: "page:/whats-new", kind: "page", id: "/whats-new", to: "/whats-new", title: "What's new", subtitle: res.releases[0]?.title || "" }] }
    }
    const read = await runReadTool(name, args, access, Date.now())
    if (!read) return { response: { ok: false, error: `Unknown tool ${name}.` }, cards: [] }
    return { response: read.response, cards: (read.results || []).map(cardFor).filter(Boolean), stats: read.stats }
  }, [access, profile])

  const ask = useCallback(async (text) => {
    const question = String(text || "").trim()
    if (!question || busy.current) return
    busy.current = true
    setError("")
    setSteps([])

    // History BEFORE saving the new message, so it is not counted twice.
    const history = thread.messages
      .filter((m) => !m.local && !m.deleted_at && m.body && (m.kind === "text" || m.kind === "assistant"))
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.kind === "assistant" ? "model" : "user", parts: [{ text: m.body }] }))

    try {
      await thread.send({ body: question })
    } catch {
      busy.current = false
      return // the bubble shows "failed" with a retry
    }

    setThinking(true)
    const contents = [...history, { role: "user", parts: [{ text: question }] }]
    const system = chatInstruction(profile)
    const cards = new Map()
    const stats = []
    const done = []

    try {
      let answer = ""
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const parts = await callModel(system, contents)
        const calls = parts.filter((p) => p.functionCall)
        if (!calls.length) {
          answer = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim()
          break
        }
        contents.push({ role: "model", parts })
        const responses = []
        for (const { functionCall: fc } of calls) {
          const args = fc.args || {}
          const label = (STEP[fc.name] || (() => ""))(args)
          if (label) { done.push(label); setSteps([...done]) }
          let out
          try {
            out = await runTool(fc.name, args)
          } catch (e) {
            out = { response: { ok: false, error: `Lookup failed: ${e?.message || "unknown error"}` }, cards: [] }
          }
          for (const c of out.cards || []) cards.set(c.key, c)
          if (out.stats?.length) stats.push(...out.stats)
          responses.push({ functionResponse: { ...(fc.id ? { id: fc.id } : {}), name: fc.name, response: out.response } })
        }
        contents.push({ role: "user", parts: responses })
      }
      if (!answer) answer = "Sorry, I could not put an answer together for that. Could you ask it another way?"

      await thread.send({
        kind: "assistant",
        body: answer,
        meta: {
          cards: [...cards.values()].slice(0, 8),
          stats: stats.slice(0, 4),
          steps: done,
        },
      })
    } catch (e) {
      setError(e?.message || "Anu could not answer. Try again.")
    } finally {
      setThinking(false)
      setSteps([])
      busy.current = false
    }
  }, [thread, profile, runTool])

  return { ask, thinking, steps, error, clearError: () => setError("") }
}
