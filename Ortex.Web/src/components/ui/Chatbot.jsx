import { useState, useRef, useEffect } from "react"
import { Link } from "react-router-dom"
import { Send, X, Volume2, VolumeX, Sparkles, ArrowRight } from "lucide-react"
import { cn } from "../../utils/cn"
import { whatsappLink } from "../../constants/site"
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
        <li key={idx} className="ml-4 list-disc text-sm my-1 text-foreground/90">
          {renderInlineBold(trimmed.substring(2))}
        </li>
      )
    }
    return (
      <p key={idx} className="text-sm my-1 leading-relaxed text-foreground/90">
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

  useEffect(() => {
    chimeRef.current = makeChime()
    
    // Automatically open the assistant after 12 seconds to engage visitors
    const t = window.setTimeout(() => {
      if (!userActed.current) {
        setOpen(true)
        if (!muted) chimeRef.current?.("open")
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
      if (nextState) play("open")
      return nextState
    })
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
    setMessages((m) => [...m, { role: "user", text: message }])
    setDraft("")
    setBusy(true)

    // Simulate AI thinking delay for a more realistic feel
    const delay = 600 + Math.min(message.length * 10, 800)
    await new Promise((r) => setTimeout(r, delay))

    const answer = localAnswer(message)
    setMessages((m) => [...m, { role: "assistant", text: answer }])
    play("receive")
    setBusy(false)
  }

  const handleSend = (e) => {
    e.preventDefault()
    sendText(draft)
  }

  return (
    <>
      {/* Floating Action Button Launcher (Keystone Style) */}
      <button
        ref={launcherRef}
        onClick={toggleOpen}
        className={cn(
          "ka-launcher",
          open && "is-open"
        )}
        aria-label="Open AI Assistant"
        aria-expanded={open}
      >
        <span className="ka-launcher-ava">
          <Sparkles className="h-5 w-5" />
        </span>
        <span className="ka-launcher-label">Ask Orty</span>
        <span className="ka-launcher-ping" />
      </button>

      {/* Backdrop (visible on mobile only) */}
      <div
        className={cn(
          "ka-backdrop",
          open && "open"
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Chat Panel Box */}
      <div
        className={cn(
          "ka-panel",
          open && "open"
        )}
        role="dialog"
        aria-label="Ortex AI Assistant"
      >
        {/* Header (Keystone Translucent Glass Style) */}
        <div className="ka-head">
          <div className="ka-title">
            <span className="ka-title-ava">
              <Sparkles className="h-4.5 w-4.5 text-white" />
              <i className="ka-title-live" />
            </span>
            <div className="ka-title-meta">
              <strong>Hi, I'm Orty</strong>
              <small>Ortex AI Guide • Active</small>
            </div>
          </div>
          <div className="ka-head-actions">
            {/* Sound Toggle */}
            <button
              onClick={() => setMuted(!muted)}
              className="ka-icon-btn"
              title={muted ? "Unmute Assistant" : "Mute Assistant"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            
            {/* Contact Action Link */}
            <Link
              to="/contact"
              onClick={() => setOpen(false)}
              className="text-xs px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-md font-bold transition-all duration-200"
            >
              Get Quote
            </Link>

            {/* Close Button */}
            <button
              onClick={() => setOpen(false)}
              className="ka-icon-btn"
              aria-label="Close Assistant"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Message Stream */}
        <div className="ka-msgs" ref={listRef}>
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "ka-row",
                m.role === "user" ? "ka-row-user" : "ka-row-assistant"
              )}
            >
              <div
                className={cn(
                  "ka-bubble",
                  m.role === "user" ? "ka-bubble-user" : "ka-bubble-assistant"
                )}
              >
                {renderText(m.text)}
              </div>
            </div>
          ))}

          {/* Thinking Indicator */}
          {busy && (
            <div className="ka-row ka-row-assistant">
              <div className="ka-bubble ka-bubble-assistant ka-thinking">
                <span className="ka-think-layer" aria-hidden="true" />
                <span className="ka-dot" />
                <span className="ka-dot" />
                <span className="ka-dot" />
              </div>
            </div>
          )}

          {/* Suggestion Chips */}
          {messages.length === 1 && !busy && (
            <div className="pt-2">
              <p className="text-[11px] text-muted-foreground font-semibold mb-2 ml-1">Suggested questions:</p>
              <div className="ka-suggest">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestionClick(s)}
                    className="ka-chip active:scale-[0.98]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sales / WhatsApp CTA Banner */}
        <div className="px-4 py-2 bg-whatsapp/5 border-t border-b border-whatsapp/10 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {/* WhatsApp Green Icon */}
            <WhatsAppIcon className="h-5 w-5 text-whatsapp fill-current" />
            <span className="text-[11px] font-semibold text-whatsapp-foreground">Need bulk pricing right away?</span>
          </div>
          <a
            href={whatsappLink("Hi Ortex, I need a bulk pricing quote for customized products.")}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1 text-[11px] font-bold text-whatsapp hover:underline"
          >
            <span>WhatsApp Sales</span>
            <ArrowRight className="h-3 w-3" />
          </a>
        </div>

        {/* Input composer with Rotating Rainbow Rim */}
        <div className="ka-input">
          <form className={cn("asst-box", busy && "is-busy")} onSubmit={handleSend}>
            <span className="asst-box-glow" aria-hidden="true">
              <i />
            </span>
            <span className="asst-box-face" aria-hidden="true" />
            <span className="asst-box-field w-full flex items-center">
              <input
                ref={inputRef}
                className="asst-box-input w-full bg-transparent border-none outline-none focus:ring-0 disabled:opacity-60 text-foreground"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Ask about Ortex"
                disabled={busy}
              />
              {!draft && (
                <span className="asst-box-ph" aria-hidden="true">
                  {busy ? "Thinking..." : "Ask Orty..."}
                </span>
              )}
            </span>
            <button
              type="submit"
              className="asst-box-send ml-2 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-ring"
              disabled={busy || !draft.trim()}
              aria-label="Send Message"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
