// Release notes for the console, newest first, rendered by pages/WhatsNew.jsx.
//
// Written for the people who use the console, not for developers: say what
// changed and what it means for their day, in a sentence or two. Add a release
// at the TOP when you bump package.json. `version` is optional because the
// early releases shipped before the console carried a real version number.
// The phone keeps its own list (Ortex.Mobile/src/constants/whatsNew.ts).
//
// `kind` is one of "new" | "improved" | "fixed".

export const RELEASES = [
  {
    id: "2026-09-26",
    version: "1.46",
    date: "2026-09-26",
    title: "A new dashboard, and a gate screen you can read across the room",
    summary: "Everything waiting on you is now in one list, and live operations sit in a column on the right.",
    items: [
      {
        kind: "new",
        title: "One list for everything that needs you",
        detail:
          "Needs you today now includes leave requests, attendance corrections, pay runs waiting for approval, social posts in review and calls the Call agent hands to a person, next to overdue invoices, new leads and quotations about to lapse. Approve leave right from the list.",
      },
      {
        kind: "new",
        title: "The gate QR code on your dashboard",
        detail:
          "If you show the attendance code, it now sits at the top right of your dashboard with its countdown, today's scans and the last person in. Open full screen puts it straight on the gate display.",
      },
      {
        kind: "improved",
        title: "A gate screen made for the wall",
        detail:
          "Full screen is now a dark display with a large code, the time, three simple steps and the latest scans. When someone scans, it greets them by name, and if the connection drops it dims the code and says so.",
      },
      {
        kind: "new",
        title: "Team today, cash flow and automation at a glance",
        detail:
          "See who is in, late or on leave, invoiced against collected week by week or month by month, where leads come from, and whether Anu, the Call agent, Social and the team bot are running smoothly.",
      },
    ],
  },
  {
    id: "2026-09-23",
    version: "1.45",
    date: "2026-09-23",
    title: "Team chat, and Anu in it",
    summary:
      "Message colleagues and groups without leaving the console, and ask Anu for help and updates in writing.",
    items: [
      {
        kind: "new",
        title: "Team chat",
        detail:
          "Open Team chat in the sidebar to message a colleague or make a group. Send photos and files, reply to a message, edit it for 15 minutes or delete it for everyone. Two ticks show when everyone has read it, and you can see who is online and typing.",
      },
      {
        kind: "new",
        title: "Anu, pinned at the top of your chats",
        detail:
          "Type a question: today's briefing, a customer, a quotation, a product, this month's numbers, how to do something in the console, or what is new. Her answers come with cards that open the record.",
      },
      {
        kind: "new",
        title: "Never miss a message",
        detail:
          "A count on Team chat and in the browser tab shows what is unread, a pop-up tells you about new messages while you work elsewhere, and desktop alerts can be switched on for when the console is in the background. Mute a busy chat from its header.",
      },
      {
        kind: "improved",
        title: "Private by design",
        detail: "Only the people in a chat can read it. Admins cannot open other people's conversations, and your Anu thread is yours alone.",
      },
    ],
  },
  {
    id: "2026-09-14",
    version: "1.44",
    date: "2026-09-14",
    title: "A dashboard for the next hour",
    summary:
      "The home page now leads with what needs doing today, and much of the field-sales app's thinking has come across to the console.",
    items: [
      {
        kind: "new",
        title: "Needs you today",
        detail:
          "Overdue invoices, Anu's complaints and unreturned calls, new web enquiries and quotations about to lapse, in one list with the most urgent first. Call from the row, or open the record in one click.",
      },
      {
        kind: "new",
        title: "Performance, pipeline and receivables",
        detail:
          "Pick 7, 30 or 90 days and see how you compare with the period before, stated in plain words. Receivables show an aging bar and days sales outstanding.",
      },
      {
        kind: "new",
        title: "Insights, Sales tab",
        detail:
          "Lead sources, most-quoted products, top customers, lost reasons, median time to quote and a weekday by time-of-day grid of when leads arrive.",
      },
      {
        kind: "new",
        title: "Ask Anu from the console",
        detail:
          "Press Ctrl J (or the Ask Anu button) and speak or type a question. She looks up customers, enquiries, quotations and products, and opens a record without ending the conversation. Anything she would change waits for your Confirm.",
      },
      {
        kind: "new",
        title: "Send a quotation on WhatsApp",
        detail:
          "Download the PDF, copy a ready message and open the customer's chat from the quotation. Sharing a draft marks it as sent.",
      },
      {
        kind: "new",
        title: "Forgot password",
        detail: "Reset your password from the sign-in page with a code sent to your email.",
      },
      {
        kind: "improved",
        title: "Search finds more",
        detail:
          "Ctrl K now searches customers, web enquiries, Anu calls, quotations, invoices and products, and opens the exact record.",
      },
      {
        kind: "improved",
        title: "Your own quotation defaults",
        detail:
          "Set your payment terms, terms and conditions and notes on My profile, and every new quotation starts with them. Unsaved quotations are kept as a draft you can resume or discard.",
      },
      {
        kind: "improved",
        title: "Safer customer records",
        detail:
          "The console checks the GSTIN format, that its state matches the place of supply, and warns you before you create a customer who already exists.",
      },
      {
        kind: "improved",
        title: "Advice before you call",
        detail:
          "Enquiries and voice calls list what to know first: a support complaint, a missing name or city, an item with no quantity, a repeat caller, or a rate that no longer matches the catalogue.",
      },
      {
        kind: "improved",
        title: "Catalogue",
        detail:
          "A full-screen photo viewer, read-only views of categories and work photos, and an Add to quote button on every product.",
      },
    ],
  },
  {
    id: "2026-09-12",
    date: "2026-09-12",
    title: "Who changed what",
    summary: "Every record now remembers who created it, who edited it and what they changed.",
    items: [
      {
        kind: "new",
        title: "Activity on every record",
        detail:
          "Quotations, invoices, products, enquiries, voice calls and customers show a history of each change, with the person and the time. Older records read Not recorded.",
      },
      {
        kind: "new",
        title: "A page for each user",
        detail: "Admins can open a colleague from Users to see their access and everything they have done in the console.",
      },
      {
        kind: "new",
        title: "Listen to website calls",
        detail:
          "The Voice calls drawer plays the recording of each call Anu took on the website, and shows whether she read the details back to the caller.",
      },
      {
        kind: "improved",
        title: "Only admins can delete a quotation",
        detail: "The rule is now enforced by the database itself, so a quotation number is never lost by accident.",
      },
      {
        kind: "fixed",
        title: "Web events name the right page",
        detail:
          "Visits to About, Get a quote and the legal pages were logged under the wrong labels. Test visits from the team's own computers no longer count.",
      },
    ],
  },
  {
    id: "2026-09-06",
    date: "2026-09-06",
    title: "A new look, and safer accounts",
    summary: "The console was redesigned and account management moved into it.",
    items: [
      {
        kind: "new",
        title: "Redesigned console",
        detail: "A cleaner layout, a sidebar grouped by Sales, Marketing and Admin, and tabbed hubs for CRM, Catalog, Billing and Insights.",
      },
      {
        kind: "new",
        title: "Manage users",
        detail:
          "Admins can deactivate an account, reset its password or delete it. New users receive their sign-in details by email, and module access is grouped so it is quicker to grant.",
      },
      {
        kind: "new",
        title: "Branded sign-in emails",
        detail: "The sign-in code now arrives in an Ortex email with the code clearly shown.",
      },
      {
        kind: "new",
        title: "Seller details on quotations",
        detail: "Quotations carry the selling company's details as well as the customer's.",
      },
      {
        kind: "improved",
        title: "Daily backups",
        detail: "The live database is backed up every day, with old copies cleared on a schedule.",
      },
    ],
  },
  {
    id: "2026-09-04",
    date: "2026-09-04",
    title: "The AI call agent",
    summary: "The console can now ring customers for you.",
    items: [
      {
        kind: "new",
        title: "Call agent",
        detail:
          "Queue follow-ups, pitches, feedback and upsell calls. The agent speaks the customer's language, summarises every call and updates the lead. A practice mode lets you try it in the browser first.",
      },
      {
        kind: "new",
        title: "Global search",
        detail: "Press Ctrl K anywhere to jump to a page or a record.",
      },
      {
        kind: "new",
        title: "Our work gallery",
        detail: "Manage the website's photos of past jobs from Catalog, with captions written by AI.",
      },
    ],
  },
]

export const KIND_LABEL = { new: "New", improved: "Improved", fixed: "Fixed" }
