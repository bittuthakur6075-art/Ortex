// What a typed message to Anu is asking for, decided by RULES, never by a
// language model: the same words always mean the same thing, it answers in
// milliseconds, and it cannot be "busy". English and everyday Hinglish.
//
// parseIntent(text) -> { intent, ...args }, one of:
//   send_team      { team, body }            "tell accounts that INV-7 is paid"
//   attendance     { team? }                 "who is not in today", "sales ki attendance"
//   team_update    { team? }                 "daily update", "accounts report"
//   whats_new      {}                        "what's new"
//   help           { topic }                 "how do I record a payment"
//   briefing       {}                        "what needs my attention today"
//   sales_summary  { days }                  "sales this month", "how are we doing"
//   quotation      { query, status }         "QT-2026-014", "sent quotations for Sharma"
//   enquiries      { query, status, days }   "new leads this week"
//   customers      { query }                 "customer Mehta", "9876543210"
//   products       { query }                 "price of satin lanyard"
//   greet / thanks {}
//   search         { query }                 anything else: search everything
//
// MIRROR of Ortex.Admin/src/lib/anuIntent.js (edit both); test/anuIntent.test.mjs
// checks the two agree on every sample sentence.

export type TeamKey = "sales" | "accounts" | "staff" | "management" | "everyone"

export type Intent =
  | { intent: "empty" | "greet" | "thanks" | "whats_new" | "briefing" }
  | { intent: "send_team"; team: TeamKey; body: string }
  | { intent: "attendance" | "team_update"; team: TeamKey | null }
  | { intent: "help"; topic: string }
  | { intent: "sales_summary"; days: number }
  | { intent: "quotation"; query: string; status: string | null }
  | { intent: "enquiries"; query: string; status: string | null; days: number | null }
  | { intent: "customers" | "products" | "search"; query: string }

export const TEAM_ALIASES: Record<TeamKey, string[]> = {
  sales: ["sales team", "sales", "sale team", "field team", "reps"],
  accounts: ["accounts team", "accounts", "account team", "accounting", "finance"],
  staff: ["staff", "factory", "production", "workers"],
  management: ["management", "managers", "admins", "admin team", "bosses"],
  everyone: ["everyone", "everybody", "all staff", "whole team", "all team", "all", "company", "sabko", "sab log", "sab"],
}

export const TEAM_TITLES: Record<TeamKey, string> = { sales: "Sales team", accounts: "Accounts team", staff: "Staff", management: "Management", everyone: "Everyone" }

const TEAM_WORDS = Object.values(TEAM_ALIASES).flat().sort((a, b) => b.length - a.length)
const TEAM_RE = TEAM_WORDS.map((w) => w.replace(/\s+/g, "\\s+")).join("|")

/** The team a phrase names, or null. Longest alias wins ("sales team" before "sales"). */
export function teamOf(text: string): TeamKey | null {
  const t = ` ${norm(text)} `
  for (const alias of TEAM_WORDS) {
    if (t.includes(` ${alias} `)) return (Object.keys(TEAM_ALIASES) as TeamKey[]).find((k) => TEAM_ALIASES[k].includes(alias)) || null
  }
  return null
}

const norm = (s: unknown) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}'\-:@.\s]/gu, " ").replace(/\s+/g, " ").trim()

const has = (t: string, re: RegExp) => re.test(t)

const QUOTATION_STATUSES = ["draft", "sent", "accepted", "rejected", "expired", "invoiced"]
const ENQUIRY_STATUSES = ["new", "contacted", "qualified", "quoted", "won", "lost"]

// Words that say WHAT to do, not what to look for; removed before searching.
const NOISE = new Set(`
  show find search look lookup up get give open list me my the a an for of about on in with details detail info
  information please pls plz can you could would tell what's whats what is are was were which who how many much
  all any some latest recent last new this that these those do does did i we our us to from by
  dikhao dikha batao bata do karo kya hai hain ka ki ke ko se wala wali wale mujhe humare hamare mera meri
  quotation quotations quote quotes qt enquiry enquiries inquiry inquiries lead leads call calls customer customers
  client clients contact contacts product products price prices rate rates cost catalogue catalog item items
  status number phone
`.split(/\s+/).filter(Boolean))

/** The search words left once the intent words are gone. */
export function queryOf(text: string, extra: string[] = []): string {
  const drop = new Set([...NOISE, ...extra])
  return norm(text).split(" ").filter((w) => w && !drop.has(w)).join(" ").trim()
}

/** "today" 1, "yesterday" 2, "this week" 7, "this month" 30, "last 90 days" 90. */
export function daysOf(text: string): number | null {
  const t = norm(text)
  const n = t.match(/\b(?:last|past|pichle)\s+(\d{1,3})\s+(?:days?|din)\b/)
  if (n) return Math.min(365, Number(n[1]))
  if (/\b(today|aaj)\b/.test(t)) return 1
  if (/\b(yesterday|kal)\b/.test(t)) return 2
  if (/\b(this|last|past)\s+week\b|\bweek\b|\bhafte\b/.test(t)) return 7
  if (/\b(this|last|past)\s+month\b|\bmonth\b|\bmahine\b/.test(t)) return 30
  if (/\bquarter\b|\b90\b/.test(t)) return 90
  if (/\byear\b|\bsaal\b/.test(t)) return 365
  return null
}

function statusIn(t: string, list: string[]): string | null {
  return list.find((s) => new RegExp(`\\b${s}\\b`).test(t)) || null
}

// "send to sales team: meeting at 5", "tell accounts that INV-7 is paid",
// "announce to everyone office closed tomorrow", "sales team ko bolo meeting at 5".
function parseSend(raw: string): { team: TeamKey | null; body: string } | null {
  const text = String(raw || "").trim()
  const verbs = "send|tell|message|msg|inform|announce|notify|post|remind|ask"
  const en = new RegExp(
    `^(?:please\\s+|pls\\s+)?(?:${verbs})\\s+(?:a\\s+message\\s+|an?\\s+update\\s+)?(?:to\\s+)?(?:the\\s+)?(${TEAM_RE})(?:\\s+team)?\\b\\s*(?:that\\b|to\\b|:|-|,)?\\s*([\\s\\S]+)$`,
    "i",
  )
  let m = text.match(en)
  if (m) return { team: teamOf(m[1]), body: m[2].trim() }
  const hiBefore = new RegExp(`^(${TEAM_RE})(?:\\s+team)?\\s+(?:ko|se)\\s+(?:bolo|batao|bhejo|bol\\s+do|bata\\s+do|message\\s+karo|inform\\s+karo)\\s*(?:ki|:|-)?\\s*([\\s\\S]+)$`, "i")
  m = text.match(hiBefore)
  if (m) return { team: teamOf(m[1]), body: m[2].trim() }
  // "sabko" already carries its "ko", so the "ko" is optional here and checked below.
  const hiAfter = new RegExp(`^(${TEAM_RE})(?:\\s+team)?(\\s+ko)?\\s+([\\s\\S]+?)\\s+(?:bolo|batao|bhejo|bol\\s+do|bata\\s+do)\\s*$`, "i")
  m = text.match(hiAfter)
  if (m && (m[2] || /ko$/i.test(m[1]))) return { team: teamOf(m[1]), body: m[3].trim() }
  return null
}

const periodWords = ["today", "yesterday", "week", "month", "quarter", "year", "days", "day", "aaj", "kal", "past", "last", "this"]

export function parseIntent(raw: string): Intent {
  const text = String(raw || "").trim()
  const t = norm(text)
  if (!t) return { intent: "empty" }

  const send = parseSend(text)
  if (send?.team && send.body) return { intent: "send_team", team: send.team, body: send.body }

  if (/^(hi|hello|hey|hii+|namaste|namaskar|good\s+(morning|afternoon|evening)|yo)\b[\s!.]*$/.test(t)) return { intent: "greet" }
  if (/^(thanks|thank\s+you|thx|ok|okay|great|shukriya|dhanyavaad|theek hai)\b[\s!.]*$/.test(t)) return { intent: "thanks" }

  if (has(t, /\b(attendance|haazri|hajri|haajri|present|absent|checked\s*in|check\s*in|check-in|checked\s*out|check\s*out|who'?s\s+in|who\s+is\s+(in|not\s+in|absent|late|on\s+leave)|not\s+in|late\s+today|came\s+late|on\s+leave|leave\s+today|kaun\s+(aaya|nahi|nhi)|kon\s+(aaya|nahi)|chutti)\b/)) {
    return { intent: "attendance", team: teamOf(t) }
  }

  if (has(t, /\b(daily\s+update|team\s+update|morning\s+update|today'?s\s+update|daily\s+report|team\s+report|update\s+for|report\s+for)\b/)
      || (teamOf(t) && has(t, /\b(update|report|summary)\b/) && !has(t, /\bsales\s+summary\b/))) {
    return { intent: "team_update", team: teamOf(t) }
  }

  if (has(t, /\b(what'?s\s+new|whats\s+new|what\s+is\s+new|new\s+features?|release\s+notes|changelog|kya\s+naya|console\s+updates?|app\s+updates?)\b/)) return { intent: "whats_new" }

  if (has(t, /^(how|where|kaise|kaha|kahan|help|guide|explain)\b|\bhow\s+(do|to|can|should)\b|\bkaise\s+(kare|karu|karein|karte)\b|\bkahan\s+(hai|milega)\b/)) {
    return { intent: "help", topic: text }
  }

  if (has(t, /\b(attention|pending|to\s*-?do|todo|briefing|brief\s+me|priorit|follow\s*-?\s*ups?|aaj\s+ka\s+kaam|kya\s+karna|what\s+should\s+i\s+do|my\s+day)\b/)) return { intent: "briefing" }

  if (has(t, /\b(sales|revenue|numbers|performance|how\s+are\s+we\s+doing|win\s+rate|conversion|business|kitna\s+(hua|bika)|target)\b/) && !has(t, /\bsales\s+team\b/)) {
    return { intent: "sales_summary", days: daysOf(t) || 30 }
  }

  const qtNumber = text.match(/\b(?:QT|QTN|QUO)[-/\s]?[\w-]*\d+\b/i)
  if (qtNumber || has(t, /\b(quotation|quotations|quote|quotes)\b/)) {
    const status = statusIn(t, QUOTATION_STATUSES)
    return { intent: "quotation", query: qtNumber ? qtNumber[0] : queryOf(t, [...QUOTATION_STATUSES, ...periodWords]), status }
  }

  if (has(t, /\b(lead|leads|enquir\w*|inquir\w*|calls?|anu\s+calls?|voice\s+calls?)\b/)) {
    const status = statusIn(t, ENQUIRY_STATUSES)
    return { intent: "enquiries", query: queryOf(t, [...ENQUIRY_STATUSES, ...periodWords, "anu", "voice", "website", "web"]), status, days: daysOf(t) }
  }

  if (has(t, /\b(price|prices|rate|rates|cost|catalogue|catalog|product|products|moq|minimum\s+order|lanyards?|keychains?|trophy|trophies|mdf|acrylic|badges?|id\s+cards?|mementos?)\b/)) {
    return { intent: "products", query: queryOf(t, ["moq", "minimum", "order", "of", "the"]) || t }
  }

  const phone = t.replace(/[\s-]/g, "").match(/(?:\+?91)?(\d{10})/)
  if (phone || has(t, /\b(customer|customers|client|clients|contact|contacts|gstin|company)\b/)) {
    return { intent: "customers", query: phone ? phone[1] : queryOf(t, ["gstin", "company"]) }
  }

  return { intent: "search", query: queryOf(t) || t }
}

