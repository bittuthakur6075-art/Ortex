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
    id: "1.52.0",
    version: "1.52.0",
    date: "2026-09-30",
    title: "Holidays, leave balances and Sunday work",
    items: [
      {
        kind: "new",
        title: "Holidays under Attendance, Team",
        detail: "Admins can now add, edit, switch off and remove holidays from Attendance, Team, Holidays. Before, only the Super Admin could.",
      },
      {
        kind: "improved",
        title: "Choose who manages holidays",
        detail: "Manage holidays is a module on the Modules page, so the Super Admin can take it off Admins, give it to a role or to one person, or hide it from someone.",
      },
      {
        kind: "new",
        title: "Choose who manages leave balances",
        detail:
          "Manage leave balances is a new module. Only the Super Admin has it until they tick the Admins who may. Balances can be added to, reduced or set to an exact figure, and any adjustment can be undone from the ledger, always with a note.",
      },
      {
        kind: "improved",
        title: "Working on a Sunday or holiday is extra time",
        detail:
          "Sunday stays the weekend. If someone comes in on a Sunday or a holiday, their check-in, check-out and hours are recorded, but the day stays a weekly off or holiday and is never marked absent or half day for leaving early.",
      },
    ],
  },
  {
    id: "1.51.0",
    version: "1.51.0",
    date: "2026-09-30",
    title: "Gate QR code for Admins, and hide per person",
    items: [
      {
        kind: "improved",
        title: "Admins can show the gate QR code",
        detail: "Every Admin now sees Attendance, QR code and the gate card on the Dashboard. The Super Admin can still take it away on Modules, Roles.",
      },
      {
        kind: "new",
        title: "Show or hide any module for one person",
        detail:
          "On Modules, People, untick a box to hide that module from that person, even when their role gives it. A shield marks what comes from the role.",
      },
    ],
  },
  {
    id: "1.50.0",
    version: "1.50.0",
    date: "2026-09-30",
    title: "One place for who opens what",
    items: [
      {
        kind: "new",
        title: "Modules page for the Super Admin",
        detail:
          "Admin, Modules brings module access together: switch a module off for the whole company, see who can open each one and why, and tick access for many people at once.",
      },
      {
        kind: "new",
        title: "Choose what Admins open",
        detail: "On Modules, Roles, the Admin column can now be unticked, so Admins stop reaching a module unless you give it to one of them on the People tab.",
      },
      {
        kind: "improved",
        title: "Roles and permissions moved",
        detail: "What each role can open is now on the Modules page instead of Users. Old links still land in the right place.",
      },
    ],
  },
  {
    id: "1.49.1",
    version: "1.49.1",
    date: "2026-09-30",
    title: "Holidays on My leave",
    items: [
      {
        kind: "improved",
        title: "Everyone sees the coming holidays",
        detail: "My leave now lists the next holidays beside your requests, so you can plan leave around them whatever your role.",
      },
    ],
  },
  {
    id: "1.49.0",
    version: "1.49.0",
    date: "2026-09-27",
    title: "Attendance and pay, together",
    items: [
      {
        kind: "improved",
        title: "Attendance, payslips and payroll in one place",
        detail:
          "The sidebar's Attendance is now Attendance & pay, grouped into My records (your attendance, leave and payslips), Team, Payroll and Settings. Most people see only My records, with nothing else in the way.",
      },
      {
        kind: "improved",
        title: "Requests waiting for you are counted",
        detail: "Corrections and leave requests waiting for a decision show their count on the Team tab, and the Dashboard's leave link opens the requests directly.",
      },
      {
        kind: "improved",
        title: "Insights opens from the Dashboard",
        detail: "Insights has left the sidebar. Open it with the Insights button at the top of the Dashboard, or search for it with Ctrl K.",
      },
    ],
  },
  {
    id: "1.48.0",
    version: "1.48.0",
    date: "2026-09-27",
    title: "Marketing, in one place",
    items: [
      {
        kind: "new",
        title: "A new Marketing page",
        detail:
          "Social is now Marketing. It shows every post the marketing team has put live or scheduled on Instagram and LinkedIn, with its picture and caption, plus the DMs and comments sent and where each follow-up stands. Search it, or filter by platform.",
      },
      {
        kind: "improved",
        title: "No more posting from the console",
        detail: "Posts are now made and published by the marketing team. The old post editor, AI ideas and account connections are gone.",
      },
    ],
  },
  {
    id: "1.47.0",
    version: "1.47.0",
    date: "2026-09-27",
    title: "A simpler menu, a new Settings page, and enquiry import",
    items: [
      {
        kind: "improved",
        title: "A shorter menu",
        detail:
          "The sidebar keeps the seven pages you use every day. Everything else sits under More, and Settings and your account are at the bottom. The top bar has one search box (Ctrl K) and a New button to start a quotation, invoice, payment or customer from anywhere.",
      },
      {
        kind: "improved",
        title: "Settings, one section at a time",
        detail:
          "Company, Documents, Notifications, Integrations, Security and Data each have their own page. The GSTIN is checked as you type, a preview shows how your details print on a quotation, and a bar at the bottom tells you when something is not saved yet.",
      },
      {
        kind: "new",
        title: "Import enquiries from Excel",
        detail:
          "Enquiries, Import reads your call log (Date, Name, Mobile No., Status, Product, Quantity, Rate, City, Company, Email). Each row keeps its own date and its status words, and rows already in the console are skipped.",
      },
      {
        kind: "new",
        title: "Quantity, rate and a second mobile on enquiries",
        detail: "Every enquiry now has a quantity, the rate discussed, an alternate mobile and a city, and the CSV export includes them.",
      },
    ],
  },
  {
    id: "1.46.1",
    version: "1.46.1",
    date: "2026-09-26",
    title: "Bank details on quotations",
    items: [
      {
        kind: "improved",
        title: "Customers know how to pay the advance",
        detail:
          "A quotation now carries your bank name, account number, IFSC and UPI ID under the amount in words, as an invoice always has. It shows once they are filled in under Settings, Company, and the same line is on quotations sent from the phone.",
      },
    ],
  },
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
