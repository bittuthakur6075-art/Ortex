import { useCallback, useMemo, useRef, useState } from "react"
import { canAccess } from "../../data/domain/modules"
import { TEAM_TITLES } from "../../lib/anuIntent"
import { accessFor } from "../anu/readTools"
import { answerAnu, postToTeam } from "./anuEngine"

/* ============================================================
   Anu's side of the Anu thread in Team chat: rules and data, no model.

   One question = save it to the thread, answer it with anuEngine (instant,
   deterministic), save the answer as kind 'assistant'. A message for a team
   waits in `pending` until the person presses Send, so a misread sentence can
   never reach a whole team by itself.
   ============================================================ */

export function useAssistantChat({ profile, thread }) {
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(null) // { team, body }
  const busy = useRef(false)
  const access = useMemo(() => accessFor(canAccess, profile), [profile])

  const reply = useCallback((body, meta = null) => thread.send({ kind: "assistant", body, meta }), [thread])

  const ask = useCallback(async (text) => {
    const question = String(text || "").trim()
    if (!question || busy.current) return
    busy.current = true
    setError("")
    setPending(null)
    try {
      await thread.send({ body: question })
    } catch {
      busy.current = false
      return // the bubble shows "failed" with a retry
    }
    setThinking(true)
    try {
      const out = await answerAnu(question, { profile, access })
      await reply(out.body, out.meta || null)
      if (out.pending) setPending(out.pending)
    } catch (e) {
      setError(e?.message || "Anu could not answer. Try again.")
    } finally {
      setThinking(false)
      busy.current = false
    }
  }, [thread, profile, access, reply])

  const confirmSend = useCallback(async () => {
    const p = pending
    if (!p) return
    setPending(null)
    setThinking(true)
    try {
      await reply(await postToTeam(p.team, p.body))
    } catch (e) {
      setError(e?.message || "It did not send.")
    } finally {
      setThinking(false)
    }
  }, [pending, reply])

  const cancelSend = useCallback(async () => {
    if (!pending) return
    const team = TEAM_TITLES[pending.team]
    setPending(null)
    await reply(`Okay, nothing was sent to ${team}.`).catch(() => {})
  }, [pending, reply])

  return { ask, thinking, steps: [], error, clearError: () => setError(""), pending, confirmSend, cancelSend }
}
