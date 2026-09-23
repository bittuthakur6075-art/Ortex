import { MODULES, canAccess } from "../../data/domain/modules"
import { RELEASES } from "../../data/domain/whatsNew"
import { roleLabel } from "../../lib/roles"
import { ANU_TOOLS } from "../anu/tools"

// Anu in TEAM CHAT: the typed sibling of the voice panel (components/anu/).
// Same data tools and the same pure answers (lib/anu.js through readTools.js),
// plus two of her own: how to do things in the console (HELP, below) and what
// changed in it (whatsNew.js). She only READS here: changing a status or
// drafting a quotation stays with voice Anu, whose Confirm card is built for it.

const READ_ONLY = new Set(["get_briefing", "find_customers", "find_enquiries", "find_quotations", "get_quotation", "find_products", "sales_summary"])

export const CHAT_TOOLS = [
  {
    functionDeclarations: [
      ...ANU_TOOLS[0].functionDeclarations.filter((d) => READ_ONLY.has(d.name)),
      {
        name: "console_help",
        description:
          "How to do something in the Ortex console: step-by-step help articles (quotations, invoices, payments, enquiries, products, attendance, leave, payslips, social posts, users, team chat, search). Use for any 'how do I', 'where is', 'kaise karu' question.",
        parameters: { type: "OBJECT", properties: { topic: { type: "STRING", description: "What they want to do, in their words" } }, required: ["topic"] },
      },
      {
        name: "whats_new",
        description: "The latest changes to the console: new features, improvements and fixes, newest release first. Use for 'what's new', 'any updates', 'what changed'.",
        parameters: { type: "OBJECT", properties: { releases: { type: "NUMBER", description: "How many releases, 1 to 3. Default 1." } } },
      },
    ],
  },
]

// Help articles. `module` gates an article the same way the sidebar does, so
// Anu never explains a page the person cannot open. Keep the wording in step
// with the real buttons when a page changes.
export const HELP = [
  { id: "quotation-new", module: "quotations", path: "/quotations", title: "Create a quotation",
    steps: ["Open Quotations in the sidebar and press New quotation.", "Pick the customer (or create one from the picker), then add line items. Choosing a product fills its rate, HSN and GST and lifts the quantity to its minimum order.", "Set the place of supply: it decides CGST and SGST versus IGST.", "Save. The live preview on the right is exactly what the customer will see."] },
  { id: "quotation-share", module: "quotations", path: "/quotations", title: "Send a quotation on WhatsApp or as a PDF",
    steps: ["Open the quotation from the list.", "Use Share on WhatsApp for a ready message with the PDF, or Download PDF to attach it yourself.", "Sharing a draft marks it as sent."] },
  { id: "quotation-invoice", module: "invoices", path: "/quotations", title: "Turn an accepted quotation into an invoice",
    steps: ["Open the quotation and press Convert to invoice.", "Check the invoice number, dates and lines, then save it under Billing, Invoices."] },
  { id: "invoice-new", module: "invoices", path: "/billing?tab=invoices", title: "Create an invoice",
    steps: ["Open Billing, Invoices and press New invoice.", "Pick the customer and add the lines, exactly as for a quotation.", "Invoices can also be imported from TallyPrime XML with Import."] },
  { id: "payment", module: "payments", path: "/billing?tab=payments", title: "Record a payment",
    steps: ["Open Billing, Payments and press Record payment.", "Choose the invoice it pays, the amount, date and mode. The invoice's balance updates straight away."] },
  { id: "enquiries", module: "enquiries", path: "/crm?tab=enquiries", title: "Work a website enquiry",
    steps: ["Open Enquiries in the sidebar. New ones from the website and the quote calculator arrive at the top.", "Open one: the advice at the top says what to ask before you call.", "Move its status as you go (contacted, qualified, quoted) and use Convert to quotation when they are ready for a price."] },
  { id: "voice", module: "voice-leads", path: "/crm?tab=voice", title: "Return a call Anu took on the website",
    steps: ["Open Enquiries, Voice calls. Each row is one caller, however many times Anu saved their details.", "Open it to read what they asked for, play the recording and call them back from the drawer."] },
  { id: "customer", module: "customers", path: "/customers", title: "Add or find a customer",
    steps: ["Open Customers and press New customer, or search by name, company, phone or GSTIN.", "Website enquiries and Anu's calls also become customers automatically."] },
  { id: "product", module: "products", path: "/catalog?tab=products", title: "Add a product or import many",
    steps: ["Open Catalog, Products and press New product for one.", "For many, use Import: download the template, fill it (photos can be pasted into the sheet) and upload it back.", "A product shows on the website unless you switch website visibility off."] },
  { id: "attendance", module: "attendance", path: "/attendance", title: "Mark attendance",
    steps: ["Attendance is marked in the Ortex phone app, not on the web: open the app and scan the QR code on the office screen.", "Field staff check in from the app without a code.", "Your own days are under Attendance, My attendance. A missed check-out is fixed with a correction request."] },
  { id: "leave", module: "attendance", path: "/attendance?tab=leave", title: "Apply for leave",
    steps: ["Open Attendance, Leave and press Apply for leave.", "Pick the leave type and dates. Weekly offs and holidays are not counted.", "An admin approves it; you see the decision there and on your phone."] },
  { id: "payslips", module: "payslips", path: "/payslips", title: "See your payslips",
    steps: ["Open My payslips in the sidebar. A payslip appears once that month's pay run is marked paid."] },
  { id: "social", module: "social", path: "/social", title: "Make and schedule a social post",
    steps: ["Open Social and press New post, or let the researcher suggest ideas.", "Add a photo (upload, pick a product photo, or create one with AI) and write the caption.", "Send for approval. An admin approves it and publishes it now or schedules it."] },
  { id: "users", module: "users", path: "/users", title: "Add a user or change their access",
    steps: ["Open Users and press Add user: set their email, a starting password and their role. They can be emailed their sign-in details.", "A role decides their pages; extra pages can be ticked for one person.", "Deactivating a user signs them out everywhere."] },
  { id: "chat", module: "chat", path: "/chat", title: "Use Team chat",
    steps: ["Open Team chat in the sidebar. Press the pencil to message a colleague or make a group.", "Enter sends, Shift and Enter adds a new line. Attach photos and files with the paperclip.", "Two blue ticks mean everyone in the chat has read it. Hover over a message to reply to it; your own can also be edited for 15 minutes or deleted for everyone.", "Chats are private to their members; admins cannot read them."] },
  { id: "search", module: "dashboard", path: "/", title: "Find anything fast",
    steps: ["Press Ctrl K (Cmd K on a Mac) anywhere for search across customers, enquiries, calls, quotations, invoices and products.", "Press Ctrl J to talk to Anu by voice."] },
]

export function helpFor(topic, profile) {
  const words = String(topic || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  const visible = HELP.filter((a) => canAccess(profile, a.module))
  const scored = visible
    .map((a) => {
      const hay = `${a.title} ${a.steps.join(" ")} ${a.id}`.toLowerCase()
      return { a, score: words.reduce((n, w) => n + (hay.includes(w) ? (a.title.toLowerCase().includes(w) ? 3 : 1) : 0), 0) }
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 2)
    .map((x) => x.a)
  return {
    ok: true,
    articles: scored.map(({ title, steps, path }) => ({ title, steps, page: path })),
    other_topics: scored.length ? undefined : visible.map((a) => a.title),
    next: scored.length ? "Explain the steps briefly in your own words. The page link is shown to them as a card." : "Nothing matched. Offer the closest of other_topics, or say an admin can help.",
  }
}

export function whatsNew(count = 1) {
  const n = Math.min(3, Math.max(1, Number(count) || 1))
  return {
    ok: true,
    releases: RELEASES.slice(0, n).map((r) => ({
      version: r.version, date: r.date, title: r.title, summary: r.summary,
      items: (r.items || []).map((i) => `${i.kind}: ${i.title}. ${i.detail}`),
    })),
  }
}

export function chatInstruction(profile, now = new Date()) {
  const first = (profile?.name || "").trim().split(/\s+/)[0] || "there"
  const modules = MODULES.filter((m) => !m.always && canAccess(profile, m.key)).map((m) => m.label)
  const today = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  return `You are Anu, the assistant in Team chat inside the Ortex Industries admin console. Ortex makes customised MDF and acrylic products, lanyards and ID cards, trophies, keychains, corporate gifts and OEM or white-label runs.

You are chatting with ${first}, a member of the Ortex team (${roleLabel(profile?.role) || "staff"}). You are their helpful colleague: you find their leads, quotations, customers and products, give them today's briefing and numbers, explain how to use the console, and tell them what is new in it. You never sell to them and never ask for contact details.

Today is ${today}.
${first} can open: ${modules.length ? modules.join(", ") : "no business modules"}.

HOW TO ANSWER
- Written chat: lead with the answer in one or two sentences, then at most five short "- " lines of detail. Records you find are shown under your message as cards they can click, so do not repeat every field.
- Reply in the language they write in: English, Hindi or Hinglish.
- Money the Indian way (lakh, crore, Rs or the rupee sign), dates like "15 September".
- Never show ids, JSON or tool names.

DATA
- Every figure, name, status or price must come from a tool result in this conversation. Look it up, never guess.
- If a tool says something is outside their access, say it is not in their access and an admin can grant it in Users.
- For "how do I", "where is" or "kaise" questions, use console_help. For "what's new" or "updates", use whats_new.
- You cannot change anything from chat. If they want a status changed or a quotation drafted, tell them to press Ctrl J and ask voice Anu, or open the record from a card and do it there.
- Invoices, payments and stock are not something you can look up yet: point them to Billing.`
}
