import { requestRecordingPermissionsAsync } from "expo-audio"
import React from "react"
import { Animated } from "react-native"
import type { WebViewMessageEvent } from "react-native-webview"

import { getCollectionSnapshot, loadCollection } from "@/data/collectionStore"
import { repo, type Collection } from "@/data/repo"
import { supabase } from "@/data/supabase"
import {
  briefing,
  draftLines,
  findCustomers,
  findEnquiries,
  findProducts,
  findQuotations,
  quotationDetail,
  salesSummary,
  type Access,
  type CustomerRow,
  type EnquiryRow,
  type ProductRow,
  type QuotationRow,
} from "@/domain/anu"
import {
  activityLabel,
  appendTurn,
  briefingStats,
  cancelledLine,
  cardsFrom,
  confirmedLine,
  openingLine,
  pendingActionFor,
  summaryStats,
  type PendingAction,
  type Stat,
  type SurfacedCard,
  type Turn,
  type TurnInput,
} from "@/domain/anuConversation"
import { canAccess, type Profile } from "@/domain/modules"
import { ENQUIRY_STATUS, newCustomer } from "@/domain/schema"
import { voiceCallsFrom } from "@/domain/voice"
import { staffInstruction } from "@/features/anu/prompt"
import { ANU_TOOLS } from "@/features/anu/tools"
import type { RootStackParamList } from "@/navigation/types"

/**
 * One call with Anu: the React Native half of the engine in engineHtml.ts.
 *
 * Owns everything the WebView must never hold: the Live token, the brief, the
 * tools and every read and write. A tool call arrives from the page, runs here
 * against the phone's own collections (under the signed-in user's session, so
 * RLS decides what exists), and the answer goes back as a toolResponse.
 *
 * ACCESS IS CHECKED TWICE, deliberately: `canAccess` here turns a question
 * about a module the person lacks into a plain "not in your access" for Anu to
 * say, and RLS underneath means a check forgotten here still returns nothing.
 *
 * TYPED AND SPOKEN, ONE CONVERSATION (the console's useAnuSession.js, ported):
 * `sendText` puts a typed turn into the same live audio session, so a rep in a
 * showroom can type the question and still hear the answer. Typing while idle
 * starts the session with that question as its opening line. Spoken and typed
 * lines, Anu's replies and her lookups land in one `turns` transcript
 * (domain/anuConversation.ts, which also drops a spoken echo of a typed line).
 *
 * WRITES WAIT ON A TAP OR A YES. When Anu proposes set_enquiry_status or
 * start_quotation without `confirmed: true`, the tool still refuses (as
 * before) AND the screen shows Confirm / Cancel. A tap runs the write here with
 * `confirmed: true` and reports the result back to her as text; a spoken yes
 * that makes her call again confirmed clears the card.
 */

export type AnuStatus = "idle" | "connecting" | "live" | "ended" | "error"
export type { PendingAction, SurfacedCard, Turn }
/** What the screen's WebView ref exposes; the library forwards it at runtime but does not type it. */
export type WebViewHandle = { injectJavaScript: (script: string) => void }
type Pending = { name: keyof RootStackParamList; params?: object } | null

const LIVE_MODEL = "models/gemini-3.1-flash-live-preview"
const LIVE_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token="
/** The model's end-of-speech wait. A colleague asking a quick question should not sit through a pause. */
const SILENCE_MS = 550
/** How long a goodbye may keep playing before the call is closed regardless. */
const GOODBYE_GRACE_MS = 6000

const ERROR_TEXT: Record<string, string> = {
  "mic-denied": "Anu needs the microphone. Allow it for Ortex in your phone's settings, then try again.",
  "mic-failed": "Could not open the microphone. Another app may be using it.",
  network: "Could not reach Anu. Check your connection and try again.",
  token: "Anu could not start. Check your connection and try again.",
}

async function rows<T>(name: Collection): Promise<T[]> {
  try {
    await loadCollection(name)
  } catch {
    /* the snapshot still holds the cached copy, which is better than nothing */
  }
  return getCollectionSnapshot<T>(name).items
}

/** A short-lived Live token. The staff-only function first, then the website's. */
async function mintToken(): Promise<string> {
  for (const fn of ["anu-staff-token", "orty-live-token"]) {
    const { data, error } = await supabase.functions.invoke(fn, { body: {} })
    const token = (data as { token?: string } | null)?.token
    if (!error && token) return token
    const status = (error as { context?: { status?: number } } | null)?.context?.status
    // Fall through ONLY when the staff function is not deployed yet. A refusal
    // (401/403) from it is an answer, not a reason to try the public one.
    if (fn === "anu-staff-token" && (status === 404 || /failed to send a request/i.test(error?.message || ""))) continue
    throw new Error("token")
  }
  throw new Error("token")
}

type ToolOutcome = { response: Record<string, unknown>; cards?: SurfacedCard[]; stats?: Stat[] }

const firstNameOf = (profile: Profile | null) => (profile?.name || "").trim().split(/\s+/)[0] || "The team member"

export function useAnuSession(profile: Profile | null) {
  const webRef = React.useRef<WebViewHandle>(null)
  const [ready, setReady] = React.useState(false)
  const [status, setStatus] = React.useState<AnuStatus>("idle")
  const [error, setError] = React.useState("")
  const [speaking, setSpeaking] = React.useState(false)
  const [muted, setMuted] = React.useState(false)
  const [seconds, setSeconds] = React.useState(0)
  const [turns, setTurns] = React.useState<Turn[]>([])
  const [partial, setPartialState] = React.useState<{ role: "user" | "anu"; text: string } | null>(null)
  const [thinking, setThinking] = React.useState(false)
  const [pending, setPending] = React.useState<Pending>(null)
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null)

  // Levels drive animation directly, never a re-render.
  const micLevel = React.useRef(new Animated.Value(0)).current
  const outLevel = React.useRef(new Animated.Value(0)).current

  const partialRef = React.useRef<{ role: "user" | "anu"; text: string } | null>(null)
  /** Every record surfaced this conversation, by card key, so a Confirm card can name it. */
  const known = React.useRef(new Map<string, SurfacedCard>())
  const statusRef = React.useRef<AnuStatus>("idle")
  const speakingRef = React.useRef(false)
  const endWanted = React.useRef(false)
  const endTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const access: Access = React.useMemo(
    () => ({
      enquiries: canAccess(profile, "enquiries"),
      voice: canAccess(profile, "voice-leads"),
      quotations: canAccess(profile, "quotations"),
      customers: canAccess(profile, "customers"),
      products: canAccess(profile, "products"),
    }),
    [profile],
  )

  const cmd = React.useCallback((c: object) => {
    webRef.current?.injectJavaScript(`window.anu && window.anu.cmd(${JSON.stringify(c)}); true;`)
  }, [])

  const setStat = (s: AnuStatus) => {
    statusRef.current = s
    setStatus(s)
  }
  const setPartial = (p: { role: "user" | "anu"; text: string } | null) => {
    partialRef.current = p
    setPartialState(p)
  }
  const push = React.useCallback((turn: TurnInput) => setTurns((prev) => appendTurn(prev, turn, Date.now())), [])

  // The call clock.
  React.useEffect(() => {
    if (status !== "live") return
    const timer = setInterval(() => setSeconds((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [status])

  const hangUp = React.useCallback(() => {
    if (endTimer.current) clearTimeout(endTimer.current)
    endWanted.current = false
    cmd({ type: "hangup" })
  }, [cmd])

  // Hang up on unmount, so leaving the screen never leaves a mic open.
  // The ref is captured now: by the time an unmount cleanup runs, React has
  // already detached it.
  React.useEffect(() => {
    const web = webRef.current
    return () => web?.injectJavaScript(`window.anu && window.anu.cmd({"type":"hangup"}); true;`)
  }, [])

  const surface = (results: unknown): SurfacedCard[] => {
    const cards = cardsFrom(results)
    for (const c of cards) known.current.set(c.key, c)
    return cards
  }

  const denied = (what: string) => ({
    ok: false,
    error: `${what} is not in this person's access. Tell them an admin can grant it in the Ortex console.`,
  })

  const runTool = async (name: string, args: Record<string, unknown>): Promise<ToolOutcome> => {
    const now = Date.now()
    switch (name) {
      case "get_briefing": {
        if (!access.enquiries && !access.voice && !access.quotations) return { response: denied("Leads and quotations") }
        const [enquiries, quotations] = await Promise.all([
          access.enquiries || access.voice ? rows<EnquiryRow>("enquiries") : Promise.resolve([]),
          access.quotations ? rows<QuotationRow>("quotations") : Promise.resolve([]),
        ])
        const b = briefing({ enquiries, quotations }, access, now)
        const lists = b as Record<string, { latest?: unknown[] } & Record<string, unknown[]>>
        const cards = surface([
          ...(lists.anu_calls_to_return?.latest || []),
          ...(lists.new_enquiries?.latest || []),
          ...(lists.quotations?.expiring_within_3_days || []),
          ...(lists.quotations?.already_expired_but_still_sent || []),
        ])
        return { response: { ok: true, ...b }, cards, stats: briefingStats(b) }
      }
      case "find_customers": {
        if (!access.customers) return { response: denied("Customers") }
        const [customers, quotations] = await Promise.all([
          rows<CustomerRow>("customers"),
          access.quotations ? rows<QuotationRow>("quotations") : Promise.resolve([]),
        ])
        const results = findCustomers(customers, quotations, String(args.query || ""))
        return { response: { ok: true, count: results.length, results }, cards: surface(results) }
      }
      case "find_enquiries": {
        if (!access.enquiries && !access.voice) return { response: denied("Enquiries") }
        const out = findEnquiries(
          await rows<EnquiryRow>("enquiries"),
          { query: args.query as string, status: args.status as string, days: Number(args.days) || undefined },
          access,
          now,
        )
        return { response: { ok: true, ...out }, cards: surface(out.results) }
      }
      case "find_quotations": {
        if (!access.quotations) return { response: denied("Quotations") }
        const out = findQuotations(await rows<QuotationRow>("quotations"), { query: args.query as string, status: args.status as string })
        return { response: { ok: true, ...out }, cards: surface(out.results) }
      }
      case "get_quotation": {
        if (!access.quotations) return { response: denied("Quotations") }
        const q = (await rows<QuotationRow>("quotations")).find((x) => x.id === args.id)
        if (!q) return { response: { ok: false, error: "No quotation with that id. Search again with find_quotations." } }
        const detail = quotationDetail(q)
        return { response: { ok: true, ...detail }, cards: surface(detail) }
      }
      case "find_products": {
        if (!access.products) return { response: denied("The product catalogue") }
        const results = findProducts(await rows<ProductRow>("products"), String(args.query || ""))
        return { response: { ok: true, count: results.length, results }, cards: surface(results) }
      }
      case "sales_summary": {
        const days = Math.min(365, Math.max(1, Number(args.days) || 30))
        const [enquiries, quotations] = await Promise.all([
          access.enquiries || access.voice ? rows<EnquiryRow>("enquiries") : Promise.resolve([]),
          access.quotations ? rows<QuotationRow>("quotations") : Promise.resolve([]),
        ])
        const summary = salesSummary({ enquiries, quotations }, days, access, now)
        return { response: { ok: true, ...summary }, stats: summaryStats(summary) }
      }
      case "set_enquiry_status": {
        const kind = String(args.kind)
        if (kind === "voice_call" ? !access.voice : !access.enquiries) return { response: denied(kind === "voice_call" ? "Voice calls" : "Enquiries") }
        const statusId = String(args.status)
        const label = ENQUIRY_STATUS.find((s) => s.id === statusId)?.label
        if (!label) return { response: { ok: false, error: "Unknown status." } }
        if (args.confirmed !== true) {
          setPendingAction(pendingActionFor(name, args, known.current))
          return {
            response: {
              ok: false,
              needs_confirmation: true,
              next: "Read the change back and ask for a yes, then call again with confirmed true. The screen is also showing Confirm and Cancel.",
            },
          }
        }
        setPendingAction(null)
        const enquiries = await rows<EnquiryRow>("enquiries")
        const ids =
          kind === "voice_call"
            ? (voiceCallsFrom(enquiries).find((c) => c.id === args.id)?.rows || []).map((r) => r.id)
            : enquiries.some((e) => e.id === args.id)
              ? [String(args.id)]
              : []
        if (!ids.length) return { response: { ok: false, error: "That record was not found. Search again first." } }
        try {
          // A folded Anu call is several rows; its status is all of them, as on its page.
          await Promise.all(ids.map((rowId) => repo.update("enquiries", rowId, { status: statusId })))
          void loadCollection("enquiries")
          const record = known.current.get(`${kind}:${args.id}`)
          return { response: { ok: true, saved: `Status is now ${label}.` }, cards: record ? [{ ...record, subtitle: label }] : [] }
        } catch (e) {
          return { response: { ok: false, error: `The change was not saved: ${(e as Error)?.message || "unknown error"}. Tell them it did not go through.` } }
        }
      }
      case "start_quotation": {
        if (!access.quotations) return { response: denied("Quotations") }
        if (args.confirmed !== true) {
          setPendingAction(pendingActionFor(name, args, known.current))
          return {
            response: {
              ok: false,
              needs_confirmation: true,
              next: "Read back the customer and each item with its quantity, get a yes, then call again with confirmed true. The screen is also showing Confirm and Cancel.",
            },
          }
        }
        setPendingAction(null)
        const [customers, products] = await Promise.all([
          access.customers ? rows<CustomerRow>("customers") : Promise.resolve([] as CustomerRow[]),
          access.products ? rows<ProductRow>("products") : Promise.resolve([] as ProductRow[]),
        ])
        const byId = customers.find((c) => c.id === args.customer_id)
        const byName = !byId && args.customer_name ? findCustomers(customers, [], String(args.customer_name))[0] : null
        const picked = byId || (byName ? customers.find((c) => c.id === byName.id) : null)
        const customer = picked
          ? newCustomer({
              name: picked.name,
              company: picked.company,
              email: picked.email,
              phone: picked.phone,
              gstin: picked.gstin,
              stateCode: picked.stateCode,
              address: picked.address,
            })
          : newCustomer({ name: String(args.customer_name || "") })
        const { lines, unmatched } = draftLines(products, (args.items as { product: string; quantity?: string }[]) || [])
        setPending({ name: "QuotationEditor", params: { prefill: { customer, lines, notes: "" } } })
        return {
          response: {
          ok: true,
          opening: "a draft quotation",
          customer: picked ? "matched to the saved customer" : "not a saved customer, entered by name",
          lines: lines.length,
          unpriced_items: unmatched.length ? unmatched : undefined,
          next: `Tell them the draft is opening for them to check${unmatched.length ? `, and that ${unmatched.join(", ")} had no catalogue price so they must add the rate` : ""}. Then call end_call.`,
          },
        }
      }
      case "open_record": {
        const kind = String(args.kind)
        const id = String(args.id || "")
        const route: Record<string, [keyof RootStackParamList, boolean]> = {
          customer: ["CustomerDetail", access.customers],
          enquiry: ["EnquiryDetail", access.enquiries],
          voice_call: ["VoiceCallDetail", access.voice],
          quotation: ["QuotationDetail", access.quotations],
          product: ["ProductDetail", access.products],
        }
        const target = route[kind]
        if (!target || !id) return { response: { ok: false, error: "Unknown record." } }
        if (!target[1]) return { response: denied("That record") }
        setPending({ name: target[0], params: { id } })
        return { response: { ok: true, next: "Say you are opening it, then call end_call." } }
      }
      case "end_call": {
        endWanted.current = true
        // Let the goodbye finish playing; close regardless after a grace period.
        if (endTimer.current) clearTimeout(endTimer.current)
        endTimer.current = setTimeout(() => endWanted.current && hangUp(), GOODBYE_GRACE_MS)
        return { response: { ok: true } }
      }
      default:
        return { response: { ok: false, error: `Unknown tool ${name}.` } }
    }
  }

  const onMessage = (event: WebViewMessageEvent) => {
    let m: Record<string, unknown>
    try {
      m = JSON.parse(event.nativeEvent.data)
    } catch {
      return
    }
    switch (m.type) {
      case "ready":
        setReady(true)
        return
      case "status": {
        const s = m.status as AnuStatus
        if (s === "error") {
          const code = String(m.message || "")
          setError(ERROR_TEXT[code] || ERROR_TEXT.network)
        }
        if (s === "ended" || s === "error") {
          setSpeaking(false)
          speakingRef.current = false
          setThinking(false)
          // Whatever was mid-sentence when the line closed still belongs in the transcript.
          const last = partialRef.current
          if (last) push({ role: last.role, text: last.text })
          setPartial(null)
          setPendingAction(null)
          micLevel.setValue(0)
          outLevel.setValue(0)
          if (endTimer.current) clearTimeout(endTimer.current)
        }
        setStat(s)
        return
      }
      case "level":
        // Levels land ~12 times a second; glide to each on the native driver so
        // the rings move continuously instead of stepping.
        Animated.parallel([
          Animated.timing(micLevel, { toValue: Number(m.mic) || 0, duration: 90, useNativeDriver: true }),
          Animated.timing(outLevel, { toValue: Number(m.out) || 0, duration: 90, useNativeDriver: true }),
        ]).start()
        return
      case "speaking":
        speakingRef.current = !!m.speaking
        setSpeaking(!!m.speaking)
        if (m.speaking) setThinking(false)
        // The goodbye has finished playing: now it is safe to hang up.
        if (!m.speaking && endWanted.current) setTimeout(() => endWanted.current && !speakingRef.current && hangUp(), 400)
        return
      case "caption": {
        const role = m.role as "user" | "anu"
        const text = String(m.text || "")
        if (m.final) {
          setPartial(null)
          push({ role, text })
          if (role === "user" && text) setThinking(true)
        } else {
          setPartial({ role, text })
        }
        return
      }
      case "tool": {
        const id = String(m.id)
        const name = String(m.name)
        const args = (m.args as Record<string, unknown>) || {}
        setThinking(true)
        void runTool(name, args)
          .catch((e): ToolOutcome => ({ response: { ok: false, error: `Lookup failed: ${(e as Error)?.message || "unknown error"}` } }))
          .then(({ response, cards, stats }) => {
            const label = activityLabel(name, args)
            if (label) {
              const count = (response.total ?? response.count) as number | undefined
              push({
                role: "tool",
                text: label,
                tool: name,
                failed: response.ok === false && !response.needs_confirmation,
                count: typeof count === "number" ? count : undefined,
                cards,
                stats,
              })
            }
            cmd({ type: "toolResult", id, name, response })
          })
        return
      }
    }
  }

  /**
   * A typed turn into the live session. Returns false when there is no live
   * line to send it on, so the composer keeps the text. `echo: false` is for
   * the notes the screen sends Anu itself (a Confirm tap), which are not the
   * person's words and are not shown.
   */
  const sendText = React.useCallback(
    (text: string, { echo = true }: { echo?: boolean } = {}) => {
      const words = String(text || "").trim()
      if (!words || statusRef.current !== "live") return false
      // Commit what was half-heard first, so the typed line follows it. The
      // engine drops its own copy of that partial when the text arrives.
      const half = partialRef.current
      if (half) push({ role: half.role, text: half.text })
      setPartial(null)
      if (echo) push({ role: "user", text: words, typed: true })
      setThinking(true)
      cmd({ type: "text", text: words })
      return true
    },
    [cmd, push],
  )

  const start = React.useCallback(
    async (question?: string) => {
      if (statusRef.current === "connecting") return
      if (statusRef.current === "live") {
        if (question) sendText(question)
        return
      }
      const asked = String(question || "").trim()
      setError("")
      setTurns(asked ? appendTurn([], { role: "user", text: asked, typed: true }) : [])
      setPartial(null)
      setPending(null)
      setPendingAction(null)
      setThinking(false)
      known.current = new Map()
      setSeconds(0)
      setMuted(false)
      endWanted.current = false
      setStat("connecting")
      try {
        const permission = await requestRecordingPermissionsAsync()
        if (!permission.granted) {
          setError(ERROR_TEXT["mic-denied"])
          setStat("error")
          return
        }
        const token = await mintToken()
        // A question typed or tapped while idle IS the opening line: one path.
        if (asked) setThinking(true)
        cmd({
          type: "start",
          url: LIVE_URL + token,
          opening: openingLine(firstNameOf(profile), asked),
          setup: {
            model: LIVE_MODEL,
            generationConfig: {
              responseModalities: ["AUDIO"],
              // hi-IN, as on the website: the voice that carries Hinglish naturally.
              speechConfig: { languageCode: "hi-IN", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } },
            },
            systemInstruction: { parts: [{ text: staffInstruction(profile) }] },
            tools: ANU_TOOLS,
            realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: SILENCE_MS } },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        })
      } catch (e) {
        setError(ERROR_TEXT[(e as Error)?.message] || ERROR_TEXT.token)
        setStat("error")
      }
    },
    [cmd, profile, sendText],
  )

  const toggleMute = React.useCallback(() => {
    setMuted((m) => {
      cmd({ type: "mute", muted: !m })
      return !m
    })
  }, [cmd])

  /** A Confirm tap is the yes: run the write here, then tell Anu how it went. */
  const confirmAction = async () => {
    const action = pendingAction
    if (!action) return
    setPendingAction(null)
    setThinking(true)
    let outcome: ToolOutcome
    try {
      outcome = await runTool(action.name, { ...action.args, confirmed: true })
    } catch (e) {
      outcome = { response: { ok: false, error: (e as Error)?.message || "unknown error" } }
    }
    push({
      role: "tool",
      text: action.name === "start_quotation" ? "Started a draft quotation" : "Updated a lead's status",
      tool: action.name,
      failed: outcome.response.ok === false,
      cards: outcome.cards,
    })
    sendText(confirmedLine(firstNameOf(profile), outcome.response), { echo: false })
  }

  const cancelAction = () => {
    if (!pendingAction) return
    setPendingAction(null)
    push({ role: "tool", text: "Change cancelled", tool: "cancel" })
    sendText(cancelledLine(firstNameOf(profile)), { echo: false })
  }

  /** Back to the welcome page after a conversation has ended or failed. */
  const reset = React.useCallback(() => {
    if (statusRef.current === "connecting" || statusRef.current === "live") return
    setStat("idle")
    setTurns([])
    setPartial(null)
    setPendingAction(null)
    setSeconds(0)
    setError("")
  }, [])

  return {
    webRef,
    access,
    ready,
    onMessage,
    status,
    error,
    speaking,
    thinking,
    muted,
    seconds,
    turns,
    partial,
    pending,
    pendingAction,
    micLevel,
    outLevel,
    start,
    sendText,
    confirmAction,
    cancelAction,
    reset,
    hangUp,
    toggleMute,
  }
}
