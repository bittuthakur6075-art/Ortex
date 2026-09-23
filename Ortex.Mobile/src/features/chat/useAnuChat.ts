/**
 * Anu's side of the Anu thread on the phone: rules and data, no model. The
 * port of Ortex.Admin/src/components/chat/useAssistantChat.js.
 *
 * One question = save it to the thread, answer it with anuEngine (instant,
 * deterministic), save the answer as kind 'assistant'. A message for a team
 * waits in `pending` until the person taps Send.
 */

import React from "react"

import type { TeamKey } from "@/domain/anuIntent"
import { TEAM_TITLES } from "@/domain/anuIntent"
import type { Profile } from "@/domain/modules"
import { accessOf, answerAnu, postToTeam } from "@/features/chat/anuEngine"
import type { SendInput } from "@/features/chat/useChat"

type Thread = { send: (m: SendInput) => Promise<unknown> }

export function useAnuChat(profile: Profile | null, thread: Thread) {
  const [thinking, setThinking] = React.useState(false)
  const [error, setError] = React.useState("")
  const [pending, setPending] = React.useState<{ team: TeamKey; body: string } | null>(null)
  const busy = React.useRef(false)
  const access = React.useMemo(() => accessOf(profile), [profile])

  const reply = React.useCallback(
    (body: string, meta: Record<string, unknown> | null = null) => thread.send({ kind: "assistant", body, meta }),
    [thread],
  )

  const ask = React.useCallback(
    async (text: string) => {
      const question = text.trim()
      if (!question || busy.current) return
      busy.current = true
      setError("")
      setPending(null)
      try {
        await thread.send({ body: question })
      } catch {
        busy.current = false
        return
      }
      setThinking(true)
      try {
        const out = await answerAnu(question, profile, access)
        await reply(out.body, (out.meta as Record<string, unknown>) || null)
        if (out.pending) setPending(out.pending)
      } catch (e) {
        setError((e as Error).message || "Anu could not answer. Try again.")
      } finally {
        setThinking(false)
        busy.current = false
      }
    },
    [thread, profile, access, reply],
  )

  const confirmSend = React.useCallback(async () => {
    const p = pending
    if (!p) return
    setPending(null)
    setThinking(true)
    try {
      await reply(await postToTeam(p.team, p.body))
    } catch (e) {
      setError((e as Error).message || "It did not send.")
    } finally {
      setThinking(false)
    }
  }, [pending, reply])

  const cancelSend = React.useCallback(async () => {
    const p = pending
    if (!p) return
    setPending(null)
    await reply(`Okay, nothing was sent to ${TEAM_TITLES[p.team]}.`).catch(() => undefined)
  }, [pending, reply])

  return { ask, thinking, error, clearError: () => setError(""), pending, confirmSend, cancelSend }
}
