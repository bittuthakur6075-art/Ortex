import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { VolumeHigh, VolumeSlash, CloseCircle, Send2, Refresh2 } from "iconsax-react"
import { whatsappLink } from "../../constants/site"
import { submitEnquiry } from "../../lib/leads"
import { supabase, hasSupabase } from "../../lib/supabaseClient"
import WhatsAppIcon from "./WhatsAppIcon"

/* ============================================================
   Ortex AI Assistant (Orty)
   
   A premium floating chatbot widget styled exactly to match Keystone.
   Includes:
   - Web Audio API chimes (soft sine/triangle sounds)
   - Interactive sound toggle (mute/unmute)
   - Keyboard accessibility (Escape to close, Enter to send)
   - Dynamic client-side knowledge matching for Ortex Industries
   - Seamless transition animations
   - Rotating rainbow boundary glow & animated gradient placeholder
   - Multi-format text support (bold rendering and bullet lists)
   - WhatsApp CTA and Get Quote link integration
   ============================================================ */

// Shared ease-out curve (matches the site's motion signature).
const EASE = [0.22, 1, 0.36, 1]

const GREETING = {
  role: "assistant",
  text: "Hi! I'm **Orty**, your Ortex Industries guide. 🌟\n\nI can tell you all about our MDF & Acrylic products, custom lanyards, corporate gifts, ordering process, or connect you with sales.\n\nHow can I help you today?",
}

const SUGGESTIONS = [
  "What products do you make?",
  "Can I get custom designs?",
  "What is your MOQ?",
  "Do you ship PAN India?",
  "How do I order?",
  "Talk to sales",
]

const KB = [
  {
    test: /product|make|items|offer|catalogue|range|manufacture/i,
    answer: "Ortex Industries specializes in premium customized products. Our primary ranges include:\n- **MDF Products:** fridge magnets, keychains, frames, exam boards, and clipboards.\n- **Acrylic Products:** keychains, badges, stands, and signs.\n- **ID Accessories:** custom printed lanyards, ID card holders, and reels.\n- **Corporate Gifts:** branded diaries, pens, mugs, water bottles, and gift sets.\n\nAll items are custom-manufactured to your exact requirements!"
  },
  {
    test: /mdf|magnet|board|frame/i,
    answer: "We manufacture high-grade **MDF Customized Products**:\n- **MDF Magnets & Keychains:** Cut to any shape with vibrant printing.\n- **MDF Photo Frames:** Sleek corporate and personal designs.\n- **Examination Boards & Clipboards:** Hard-board clipboards with customized logos, prints, or grids.\n\nThese are perfect for school/college supplies, corporate branding, or retail!"
  },
  {
    test: /acrylic|badge|stand|keychain/i,
    answer: "Our **Acrylic Custom Products** are top-tier:\n- **Acrylic Keychains:** Double-sided printing with clear, diamond-cut edges.\n- **Acrylic Badges:** Custom shape pin-backs and magnetic badges.\n- **Acrylic Stands:** Character stands, desktop displays, and signage.\n\nWe use advanced laser-cutting machinery to guarantee clean, smooth edges."
  },
  {
    test: /lanyard|id card|card holder|ribbon/i,
    answer: "We supply premium **Custom Printed Lanyards & ID Accessories**:\n- High-quality satin polyester ribbons.\n- Widths available in 12mm, 16mm, 20mm, and 25mm.\n- Single or double hook options, safety breakouts, and customized printing.\n- Branded ID card holders and retractable badge reels.\n\nPerfect for corporate offices, exhibitions, and educational institutions!"
  },
  {
    test: /corporate|gift|giveaway|brand/i,
    answer: "Looking for **Corporate Gifting or Branding**? We offer curated promotional items:\n- Premium customized diaries, journals, and planners.\n- Branded metal/plastic pens and desk organizers.\n- Custom printed ceramic mugs, steel bottles, and tech organizers.\n- Customized gift combos in presentation boxes.\n\nBoost your brand recall with premium promotional giveaways!"
  },
  {
    test: /price|cost|quote|rate|bill|how much/i,
    answer: "Pricing is highly customized based on your product choice, design complexity, and order quantity. We offer competitive factory rates.\n\nFor a custom quote, you can:\n- Click [Get Quote](/quote) to use our custom calculator.\n- Chat with us directly on [WhatsApp](https://wa.me/919211947188).\n- Send us an email at **sales@ortexindustries.in**."
  },
  {
    test: /custom|design|logo|mockup|artwork|own/i,
    answer: "Absolutely! Everything we do is custom-made. You supply the logo or design, and our designers will create a **free digital mockup** for your approval before we start production. We accommodate custom shapes, colors, and dimensions!"
  },
  {
    test: /moq|minimum|quantity|order volume/i,
    answer: "Our Minimum Order Quantities (MOQ) are low to help businesses of all sizes:\n- **Lanyards:** MOQ 100 units.\n- **MDF / Acrylic Keychains:** MOQ 50 units.\n- **Exam Boards / Clipboards:** MOQ 50 units.\n- **Corporate Gift Sets:** MOQ 25 sets.\n\nFor smaller quantities, feel free to contact us and we will try to accommodate your order!"
  },
  {
    test: /shipping|delivery|export|deliv|pan india|send|where/i,
    answer: "We support:\n- **PAN India Delivery:** Fast courier shipping to all major cities, towns, and hubs across India.\n- **Worldwide Export Support:** We export our premium products globally with proper customs documentation.\n\nAll orders are securely packed in damage-resistant boxes to ensure they arrive in pristine condition."
  },
  {
    test: /contact|sales|whatsapp|phone|number|email|address|location|office/i,
    answer: "Here is how you can connect with us directly:\n- **WhatsApp Sales:** [Chat on WhatsApp](https://wa.me/919211947188)\n- **Phone Secondary:** +91-8448663297\n- **Email:** sales@ortexindustries.in\n- **Office Hours:** Mon-Sat: 9:00 AM to 6:00 PM (Sunday Closed)\n- **Location:** New Delhi, India.\n\nFeel free to tap the WhatsApp button at the bottom of the chat to start a direct thread!"
  },
  {
    test: /order|buy|purchase|how to/i,
    answer: "Ordering is simple:\n1. Send us your product requirements (qty, size, product type).\n2. Share your logo or artwork via email (**sales@ortexindustries.in**) or WhatsApp.\n3. Our design team shares a **digital mockup**.\n4. Upon your approval and order confirmation, we manufacture and ship!\n\nTap the [WhatsApp button](https://wa.me/919211947188) or fill out the [Contact Form](/contact) to begin."
  }
]

function localAnswer(q) {
  const hit = KB.find((k) => k.test.test(q))
  if (hit) return hit.answer
  return "That's a great question! For specific customizations, pricing details, or bulk catalog requests, it's best to speak with our sales representative.\n\nWould you like to [connect on WhatsApp](https://wa.me/919211947188) or send a query through our [Contact Form](/contact)?"
}

/* Lead capture. When a visitor shares a phone or email in chat, submit a lead
   into the shared `enquiries` backend (same table the admin console reads, via
   submitEnquiry — which handles Supabase insert, retry, and an offline outbox).
   Tagged source "Orty chatbot" so sales can tell where it came from. */
function extractContact(text) {
  const phone = String(text).match(/(?:\+?\d[\d\s-]{8,}\d)/)
  const email = String(text).match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  return {
    phone: phone ? phone[0].replace(/[\s-]/g, "") : null,
    email: email ? email[0] : null,
  }
}

/* Best-effort first name from the conversation ("my name is X", "I'm X"). */
function extractName(history) {
  for (const m of history) {
    if (m.role !== "user") continue
    const match = m.text.match(/\b(?:my name is|i am|i'm|this is|name'?s)\s+([A-Za-z][a-z]+(?:\s[A-Z][a-z]+)?)/i)
    if (match) return match[1].trim()
  }
  return ""
}

/* Render the chat so far as a readable transcript for the sales team. */
function formatTranscript(history) {
  return history.map((m) => `${m.role === "user" ? "Customer" : "Orty"}: ${m.text}`).join("\n\n")
}

/* Ask the Gemini-backed Supabase Edge Function (orty-chat) for a reply, sending
   recent history for context. Any failure throws so the caller can fall back to
   the local knowledge base. Using the Edge Function keeps the site fully static
   (host it anywhere, e.g. Hostinger) with no Node server of its own. */
async function fetchAiAnswer(history) {
  if (!hasSupabase) throw new Error("Assistant backend not configured")
  const { data, error } = await supabase.functions.invoke("orty-chat", {
    body: { messages: history.map((m) => ({ role: m.role, text: m.text })) },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  const reply = typeof data?.reply === "string" ? data.reply.trim() : ""
  if (!reply) throw new Error("Empty assistant reply")
  return reply
}

/* Tiny Web Audio synthesizer for chime effects */
function makeChime() {
  let ctx = null
  const tone = (freq, start, dur, gain, type) => {
    if (!ctx) return
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, ctx.currentTime + start)
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start)
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
    o.connect(g); g.connect(ctx.destination)
    o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02)
  }
  return (kind) => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      if (!ctx) ctx = new AC()
      if (ctx.state === "suspended") ctx.resume()
      if (kind === "open") {
        tone(523.25, 0, 0.16, 0.03, "sine")
        tone(783.99, 0.07, 0.22, 0.025, "sine")
      } else if (kind === "send") {
        tone(659.25, 0, 0.08, 0.02, "triangle")
      } else if (kind === "pop") {
        // Short, punchy "pop" — quick pitch blip with a fast decay.
        tone(392.0, 0, 0.06, 0.05, "triangle")
        tone(784.0, 0.015, 0.09, 0.035, "sine")
      } else {
        tone(587.33, 0, 0.12, 0.03, "sine")
        tone(880.0, 0.09, 0.22, 0.025, "sine")
      }
    } catch (e) {
      /* Audio context blocked or unsupported */
    }
  }
}

// Inline bold and list formatter
function renderText(text) {
  const lines = String(text ?? "").split("\n")
  return lines.map((line, idx) => {
    const trimmed = line.trim()
    if (trimmed.startsWith("- ")) {
      return (
        <li key={idx} className="ml-4 list-disc text-[14px] font-medium my-1 text-foreground/90">
          {renderInlineBold(trimmed.substring(2))}
        </li>
      )
    }
    return (
      <p key={idx} className="text-[14px] font-medium my-1 leading-relaxed text-foreground/90">
        {renderInlineBold(line)}
      </p>
    )
  })
}

function renderInlineBold(text) {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  
  while ((match = linkRegex.exec(text)) !== null) {
    const [_, linkText, linkUrl] = match;
    const matchIndex = match.index;
    
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }
    
    if (linkUrl.startsWith("http://") || linkUrl.startsWith("https://")) {
      const isWa = linkUrl.startsWith("https://wa.me/919211947188") || linkUrl.includes("wa.me");
      const finalUrl = isWa 
        ? whatsappLink("Hi Ortex, I am talking to Orty (AI Guide) and would like to ask about custom manufacturing/pricing.")
        : linkUrl;
        
      parts.push(
        <a 
          key={matchIndex} 
          href={finalUrl} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-primary font-bold hover:underline"
        >
          {linkText}
        </a>
      );
    } else {
      parts.push(
        <Link 
          key={matchIndex} 
          to={linkUrl} 
          className="text-primary font-bold hover:underline"
        >
          {linkText}
        </Link>
      );
    }
    
    lastIndex = linkRegex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.flatMap((part, partIdx) => {
    if (typeof part !== "string") return [part];
    return part.split(/\*\*(.+?)\*\*/g).map((seg, i) =>
      i % 2 === 1 ? <strong key={`${partIdx}-${i}`} className="font-semibold text-primary">{seg}</strong> : seg
    );
  });
}

export default function Chatbot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([GREETING])
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [muted, setMuted] = useState(false)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const launcherRef = useRef(null)
  const chimeRef = useRef(null)
  const userActed = useRef(false)
  const leadSubmittedRef = useRef(false)

  useEffect(() => {
    chimeRef.current = makeChime()
    
    // Automatically open the assistant after 12 seconds to engage visitors
    const t = window.setTimeout(() => {
      if (!userActed.current) {
        setOpen(true)
        if (!muted) chimeRef.current?.("pop")
      }
    }, 12000)

    return () => window.clearTimeout(t)
  }, [muted])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, busy])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const play = (kind) => {
    if (!muted) chimeRef.current?.(kind)
  }

  const toggleOpen = () => {
    userActed.current = true
    setOpen((o) => {
      const nextState = !o
      play("pop")
      return nextState
    })
  }

  const closeChat = () => {
    userActed.current = true
    play("pop")
    setOpen(false)
  }

  const resetChat = () => {
    setMessages([GREETING])
    setDraft("")
    leadSubmittedRef.current = false
    play("pop")
  }

  const handleSuggestionClick = (text) => {
    userActed.current = true
    if (text === "Talk to sales") {
      window.open(whatsappLink("Hi Ortex, I am talking to Orty (AI Assistant) and would like to connect with a sales representative."), "_blank", "noopener,noreferrer")
      return
    }
    sendText(text)
  }

  async function sendText(text) {
    const message = text.trim()
    if (!message || busy) return

    play("send")
    const userMsg = { role: "user", text: message }
    const history = [...messages, userMsg]
    setMessages((m) => [...m, userMsg])
    setDraft("")
    setBusy(true)

    // Lead capture: the first time a visitor shares a phone or email, submit the
    // lead to the shared enquiries backend (once per chat session).
    const contact = extractContact(message)
    if ((contact.phone || contact.email) && !leadSubmittedRef.current) {
      leadSubmittedRef.current = true
      submitEnquiry({
        source: "Orty chatbot",
        customer: {
          name: extractName(history),
          email: contact.email || "",
          phone: contact.phone || "",
          company: "",
        },
        message: `Lead captured by Orty (AI assistant).\n\n${formatTranscript(history)}`,
      }).catch(() => {
        // submitEnquiry already queues to an offline outbox; nothing to do here.
      })
    }

    let answer
    try {
      // Ask the Gemini-backed proxy, passing recent conversation for context.
      answer = await fetchAiAnswer(history)
    } catch {
      // Proxy unavailable (offline, misconfigured, or plain `vite dev`):
      // fall back to the local knowledge base so Orty always replies.
      answer = localAnswer(message)
    }

    setMessages((m) => [...m, { role: "assistant", text: answer }])
    play("pop")
    setBusy(false)
  }

  const handleSend = (e) => {
    e.preventDefault()
    sendText(draft)
  }

  return (
    <>
      {/* Floating launcher */}
      <AnimatePresence>
        {!open && (
          <motion.button
            ref={launcherRef}
            onClick={toggleOpen}
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="fixed right-6 bottom-6 z-40 inline-flex items-center gap-2.5 h-14 pl-[3px] pr-5 rounded-full bg-primary text-primary-foreground font-semibold transition-colors hover:bg-primary/90"
            aria-label="Open AI Assistant"
            aria-expanded={open}
          >
            <span className="grid justify-items-center w-[50px] h-[50px] rounded-full bg-white/20 pt-[6px] px-[6px]">
              <img src="/img/logo-symbol.svg" alt="" aria-hidden="true" className="w-full h-auto" />
            </span>
            <span className="text-[15px]">Ask Orty</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            {/* Mobile backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeChat}
              className="fixed inset-0 z-40 bg-foreground/40 sm:hidden"
              aria-hidden="true"
            />

            {/* Chat panel */}
            <motion.div
              role="dialog"
              aria-label="Ortex AI Assistant"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ duration: 0.25, ease: EASE }}
              style={{ transformOrigin: "bottom right", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", borderRadius: "30px", cornerShape: "squircle" }}
              className="fixed z-50 inset-x-0 bottom-0 sm:inset-x-auto sm:right-6 sm:bottom-6 flex flex-col w-full sm:w-[400px] h-[86vh] sm:h-[620px] sm:max-h-[calc(100vh-3rem)] bg-card overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-primary text-primary-foreground">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="relative grid place-items-center w-9 h-9 rounded-full bg-white/20 flex-shrink-0">
                    <img src="/img/logo-symbol.svg" alt="" aria-hidden="true" className="w-5 h-5" />
                  </span>
                  <div className="leading-tight min-w-0">
                    <strong className="block text-[20px] font-semibold">Hi, I'm Orty</strong>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={resetChat}
                    className="grid place-items-center w-8 h-8 rounded-full text-primary-foreground/90 hover:bg-white/10 transition-colors"
                    title="Reset chat"
                    aria-label="Reset chat"
                  >
                    <Refresh2 size={18} variant="Linear" color="currentColor" />
                  </button>
                  <button
                    onClick={() => setMuted(!muted)}
                    className="grid place-items-center w-8 h-8 rounded-full text-primary-foreground/90 hover:bg-white/10 transition-colors"
                    title={muted ? "Unmute assistant" : "Mute assistant"}
                  >
                    {muted
                      ? <VolumeSlash size={18} variant="Linear" color="currentColor" />
                      : <VolumeHigh size={18} variant="Linear" color="currentColor" />}
                  </button>
                  <button
                    onClick={closeChat}
                    className="grid place-items-center w-8 h-8 rounded-full text-primary-foreground/90 hover:bg-white/10 transition-colors"
                    aria-label="Close assistant"
                  >
                    <CloseCircle size={20} variant="Linear" color="currentColor" />
                  </button>
                </div>
              </div>

              {/* Message stream */}
              <div ref={listRef} data-lenis-prevent className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-background">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[85%] rounded-2xl rounded-tr-md bg-primary text-primary-foreground px-4 py-2.5"
                          : "max-w-[88%] rounded-2xl rounded-tl-md bg-[#F4F6F8] text-foreground px-4 py-2.5"
                      }
                    >
                      {m.role === "user" ? (
                        <p className="text-sm leading-relaxed whitespace-pre-line">{m.text}</p>
                      ) : (
                        renderText(m.text)
                      )}
                    </div>
                  </div>
                ))}

                {/* Thinking indicator */}
                {busy && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-tl-md bg-secondary border border-border px-4 py-3 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                    </div>
                  </div>
                )}

                {/* Suggestion chips */}
                {messages.length === 1 && !busy && (
                  <div className="pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                      Suggested questions
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => handleSuggestionClick(s)}
                          className="px-3 py-1.5 rounded-full border border-[#EBEDF3] bg-card text-[14px] font-semibold text-foreground hover:border-primary hover:text-primary transition-colors active:scale-[0.98]"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* WhatsApp CTA banner */}
              <div className="px-4 py-2.5 bg-whatsapp/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <WhatsAppIcon className="h-5 w-5 flex-shrink-0 text-whatsapp fill-current" />
                  <span className="text-[14px] font-medium text-foreground truncate">Prefer to chat with our team?</span>
                </div>
                <a
                  href={whatsappLink("Hi Ortex, I need a bulk pricing quote for customized products.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[14px] font-medium text-whatsapp hover:underline whitespace-nowrap"
                >
                  Message us
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>

              {/* Input composer */}
              <form onSubmit={handleSend} className="p-3 bg-card">
                <div className="relative">
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={busy}
                    placeholder={busy ? "Thinking..." : "Ask Orty anything..."}
                    aria-label="Ask about Ortex"
                    className="w-full min-w-0 pl-4 pr-14 py-2.5 bg-card border border-[#EBEDF3] rounded-full text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors disabled:opacity-60"
                  />
                  {draft.trim() && (
                    <button
                      type="submit"
                      disabled={busy}
                      aria-label="Send message"
                      className="absolute top-1 right-1 bottom-1 aspect-square grid place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Send2 size={18} variant="Bold" color="currentColor" />
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
