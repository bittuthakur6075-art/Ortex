/**
 * Release notes for the phone, newest first, rendered by
 * features/profile/WhatsNewScreen.tsx.
 *
 * Written for the rep holding the phone, not for developers: what changed and
 * what it means in the field, a sentence or two each. Add a release at the TOP
 * whenever `npm version` moves package.json. No em dashes: this is on-screen
 * text. The console keeps its own list (Ortex.Admin/src/data/domain/whatsNew.js).
 */

export type ChangeKind = "new" | "improved" | "fixed"

export type Release = {
  id: string
  /** Absent for the update that shipped before the app had a real version. */
  version?: string
  /** ISO date, formatted on screen. */
  date: string
  title: string
  summary?: string
  items: { kind: ChangeKind; title: string; detail: string }[]
}

export const KIND_LABEL: Record<ChangeKind, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
}

export const RELEASES: Release[] = [
  {
    id: "1.6.1",
    version: "1.6.1",
    date: "2026-09-27",
    title: "Attendance as a bar, and smoother scrolling",
    summary: "Your shift now fills a bar from start to end, and the top of every page scrolls cleanly under a white header.",
    items: [
      {
        kind: "improved",
        title: "Your shift as a bar",
        detail: "The attendance card shows your hours in large numbers and a bar that fills from the start of your shift to its end, with both times under it.",
      },
      {
        kind: "fixed",
        title: "Time fits the attendance card",
        detail: "The time on the Home attendance card now shows hours and minutes, and no longer overflows.",
      },
      {
        kind: "fixed",
        title: "Clean header when you scroll",
        detail: "The status bar and header are white on every page, and the cards no longer get cut at the corners while you scroll.",
      },
    ],
  },
  {
    id: "1.6.0",
    version: "1.6.0",
    date: "2026-09-26",
    title: "A cleaner Home, made for your job",
    summary: "Home, Chat, Attendance and Profile now use soft rounded cards, and Home shows what your role needs first.",
    items: [
      {
        kind: "improved",
        title: "Home for your role",
        detail: "Staff see their requests, leave, pay and the next holiday. Sales see who to call now, their month and quotes to chase. Admins can approve leave and corrections straight from Home.",
      },
      {
        kind: "improved",
        title: "Attendance out of the way",
        detail: "Once you are checked in, the attendance card shrinks to one line with your time and a Check out button. Tap it to see the full card.",
      },
      {
        kind: "improved",
        title: "Rounded cards everywhere",
        detail: "Home, Chat, Attendance and Profile sit on soft cards with smooth corners, easier to scan at a glance.",
      },
      {
        kind: "improved",
        title: "Anu asks what you would ask",
        detail: "The questions under Anu now match your job: leave and salary for staff, sales for the sales team, the business and approvals for admins.",
      },
    ],
  },
  {
    id: "1.5.1",
    version: "1.5.1",
    date: "2026-09-26",
    title: "Bank details on your quotations",
    items: [
      {
        kind: "improved",
        title: "Customers know how to pay the advance",
        detail: "The quotation PDF you share now shows the company's bank, account number, IFSC and UPI ID under the amount in words, the same as on the web.",
      },
    ],
  },
  {
    id: "1.5.0",
    version: "1.5.0",
    date: "2026-09-26",
    title: "A fresh look for attendance, chat and your profile",
    summary: "Attendance, Chat and Profile are easier to read at a glance, and each shows the one thing that needs you.",
    items: [
      {
        kind: "improved",
        title: "Attendance on Home",
        detail: "A smaller card with a ring for today's hours, your week as coloured dates, and the times check-in is open. Outside those times the slider tells you when it opens instead of refusing after you slide.",
      },
      {
        kind: "improved",
        title: "Attendance page",
        detail: "A large ring with the live time, your check-in and check-out as two tiles, this week's hours, and the month opens as a calendar.",
      },
      {
        kind: "new",
        title: "Anu at the top of Chat",
        detail: "Anu has her own place above your chats, with three questions one tap away. Chats are split into Teams and Direct, and the filters show how many are unread.",
      },
      {
        kind: "improved",
        title: "Anu's daily update",
        detail: "Anu's posts in your team channel now show as a full-width card, so they stand apart from people's messages.",
      },
      {
        kind: "improved",
        title: "Your profile",
        detail: "Your attendance today, leave left and last payday sit under your name, and each opens its page. Theme is now an Auto, Light or Dark switch on the page.",
      },
      {
        kind: "new",
        title: "A reminder to add your phone",
        detail: "If your phone number is missing, Profile asks for it, so customers and the team can call you from quotes and chat.",
      },
    ],
  },
  {
    id: "1.4.1",
    version: "1.4.1",
    date: "2026-09-23",
    title: "Chat notifications",
    summary:
      "New chat messages now appear as notifications. Still on 1.3 or older? Install once by hand: Settings, Apps, Ortex Sales, Uninstall, then open the download link your admin sends and install. Sign in again as usual.",
    items: [
      {
        kind: "new",
        title: "Chat notifications",
        detail: "A message from a colleague, a group or your team channel shows in the notification shade straight away, one notification per chat with the newest message. Tap it to open the chat.",
      },
      {
        kind: "improved",
        title: "Quiet when you are reading",
        detail: "Nothing pops up for the chat already open on your screen, and opening a chat clears its notification.",
      },
      {
        kind: "new",
        title: "Your choice",
        detail: "Turn Team chat notifications off in Profile, Notifications, or mute one busy chat from its own page with the bell.",
      },
    ],
  },
  {
    id: "1.4.0",
    version: "1.4.0",
    date: "2026-09-23",
    title: "Team chat, and Anu in it",
    summary:
      "Required update, installed once by hand: open Settings, Apps, Ortex Sales, Uninstall. Then open the download link your admin sends and install Ortex Sales 1.4.0. Sign in again as usual. Future updates arrive inside the app as before.",
    items: [
      {
        kind: "new",
        title: "Chat tab",
        detail: "Message a colleague or make a group, send photos, reply to a message and delete your own for everyone. The same chats as the Ortex console on a computer.",
      },
      {
        kind: "new",
        title: "Your team channel",
        detail: "Every team has a channel. Anu posts the daily update there in the morning and the attendance status after check-in time and again in the evening.",
      },
      {
        kind: "new",
        title: "Ask Anu in Chat",
        detail: "Type a question: what needs my attention, who is not in today, daily update, leads, quotations, a customer, a price or sales this month. Answers come straight from the database, instantly. She can also pass a message to another team after you tap Send.",
      },
      {
        kind: "improved",
        title: "Includes everything in 1.3.4",
        detail: "Attendance by QR code, the new Home order and the new Ortex signing key, which is why this one update needs a reinstall.",
      },
    ],
  },
  {
    id: "1.3.4",
    version: "1.3.4",
    date: "2026-09-23",
    title: "Attendance by QR code",
    summary:
      "One-time reinstall: uninstall Ortex Sales, then install it again from the link your admin sends. After that, updates arrive inside the app as before.",
    items: [
      {
        kind: "new",
        title: "Check in by scanning the office QR code",
        detail: "Attendance is now marked by scanning the code on the office screen. No selfie and no location are needed. The code changes every few seconds, so a photo of it will not work.",
      },
      {
        kind: "improved",
        title: "Out in the field",
        detail: "Sales staff away from the office can still check in without a code. Those check-ins are reviewed by the office.",
      },
      {
        kind: "improved",
        title: "Home page",
        detail: "Attendance and your to-do list now come first, with the shortcuts right below them.",
      },
      {
        kind: "fixed",
        title: "New signing key",
        detail: "The app is now signed with a new Ortex key, which is why this version needs one reinstall.",
      },
    ],
  },
  {
    id: "1.3.3",
    version: "1.3.3",
    date: "2026-09-20",
    title: "Leave and My pay, made easier to read",
    summary:
      "Leave and My pay now read at a glance: each leave type has its own colour and icon, and payslips, salary and claims are laid out the way you actually scan them.",
    items: [
      {
        kind: "improved",
        title: "Leave at a glance",
        detail: "Your balance, the year so far and each request now carry the same colour and icon per leave type, so casual, sick and unpaid are told apart without reading the label.",
      },
      {
        kind: "improved",
        title: "Applying for leave",
        detail: "The apply and request pages are laid out in clear steps, so the dates, the type and the reason are all visible before you send it.",
      },
      {
        kind: "improved",
        title: "My pay",
        detail: "Payslips, the salary breakup and your claims are easier to scan, and each claim category now shows its own icon.",
      },
    ],
  },
  {
    id: "1.3.2",
    version: "1.3.2",
    date: "2026-09-19",
    title: "One check-in and one check-out a day",
    summary:
      "Attendance is now one check-in and one check-out a day. If this update will not install, uninstall Ortex Sales and install it again from the link your admin sent.",
    items: [
      {
        kind: "improved",
        title: "Done for today",
        detail: "After you check out, Attendance shows Done for today with both times. A wrong time is fixed with a correction request, not a second check-in.",
      },
    ],
  },
  {
    id: "1.3.1",
    version: "1.3.1",
    date: "2026-09-19",
    title: "My pay, and attendance made clearer",
    summary:
      "One-time reinstall: uninstall Ortex Sales, then install it again from the link your admin sends. After that, updates arrive inside the app as before.",
    items: [
      {
        kind: "new",
        title: "My pay",
        detail: "Profile, My pay: your payslips with a PDF to download or share, your salary breakup, loans, and reimbursement claims with a bill photo.",
      },
      {
        kind: "improved",
        title: "Attendance, laid out like Zoho People",
        detail: "A big Check-in and Check-out button, your hours as a running timer, the week at a glance, and the month as a list or a calendar with a summary.",
      },
      {
        kind: "fixed",
        title: "Updates signed with the Ortex key",
        detail: "1.3.0 was signed with the wrong key, so later updates could not install over it. This version fixes that, which is why it needs one reinstall.",
      },
    ],
  },
  {
    id: "1.3.0",
    version: "1.3.0",
    date: "2026-09-19",
    title: "Updates arrive inside the app",
    summary: "From now on, new versions arrive inside the app. Tap Update, then Install, and you stay signed in.",
    items: [
      {
        kind: "new",
        title: "Updates inside the app",
        detail:
          "When a new version is ready the app tells you, downloads it and opens the installer. Tap Install and carry on, still signed in. No more APK files over WhatsApp.",
      },
      {
        kind: "new",
        title: "Required updates",
        detail:
          "When the office needs everyone on the new version, the app asks you to update before it opens. It remembers this even without signal.",
      },
      {
        kind: "improved",
        title: "Smaller download",
        detail: "The app is now about half the size to download.",
      },
      {
        kind: "new",
        title: "One-time setting",
        detail:
          "The first time, Android asks you to allow installs from Ortex. Switch it on once. If Play Protect offers to scan the app, tap Scan app.",
      },
    ],
  },
  {
    id: "1.2.0",
    version: "1.2.0",
    date: "2026-09-14",
    title: "Type to Anu, and live updates that arrive",
    summary: "Anu now listens and reads, and new leads reach the phone the moment they land.",
    items: [
      {
        kind: "new",
        title: "Type or talk to Anu",
        detail:
          "Type a question when you cannot speak, or tap the mic. Both go into one conversation, and a change she suggests shows a Confirm button before anything is saved.",
      },
      {
        kind: "new",
        title: "Forgot password",
        detail: "Reset your password from the sign-in screen with a code sent to your email. No need to call the office.",
      },
      {
        kind: "new",
        title: "What's new",
        detail: "This page. Find it any time under Profile.",
      },
      {
        kind: "fixed",
        title: "Enquiries and quotations update live",
        detail:
          "Changes made in the console or on another phone now appear on yours without a pull to refresh. Before this, the phone only saw them when a list was reopened.",
      },
      {
        kind: "improved",
        title: "One version number",
        detail: "The version on the Profile page is now always the version of the app you installed.",
      },
    ],
  },
  {
    id: "1.1.0",
    version: "1.1.0",
    date: "2026-09-13",
    title: "A Home page for the next ten minutes",
    summary: "A new Home tab, Anu for the team, and AI help with product photos.",
    items: [
      {
        kind: "new",
        title: "Home",
        detail:
          "Needs you today lists support calls, leads nobody has called and quotations about to lapse, each with a Call button. Below it, how the last 7, 30 or 90 days compare with the period before.",
      },
      {
        kind: "new",
        title: "Charts you can touch",
        detail:
          "Drag a finger across any chart to read the exact figure for that day. Open Insights for sources, top products, top customers, lost reasons and when leads arrive.",
      },
      {
        kind: "new",
        title: "Anu for the team",
        detail:
          "Tap the sparkle on any tab to ask Anu in Hinglish about your leads, quotations, customers and products. She can mark an enquiry or start a draft quotation for you.",
      },
      {
        kind: "new",
        title: "AI photo studio",
        detail:
          "Clean up a product photo with AI, compare before and after, and keep it only if the product, logo and text look right. The original photo is never overwritten.",
      },
      {
        kind: "new",
        title: "Team",
        detail:
          "See who can sign in and what they can reach. Admins can open a colleague, see their recent activity, deactivate the account or reset the password.",
      },
      {
        kind: "new",
        title: "Notifications you can act on",
        detail:
          "New enquiries and Anu's calls ring with their own sound. Call or WhatsApp straight from the notification, without opening the app.",
      },
      {
        kind: "improved",
        title: "Smoother loading",
        detail: "Pages show their own shape while they load, and a slow connection says so instead of spinning.",
      },
    ],
  },
  {
    id: "2026-09-12",
    date: "2026-09-12",
    title: "The whole catalogue in your hand",
    summary: "Categories and work photos can be edited from the field, and Anu's calls can be heard.",
    items: [
      {
        kind: "new",
        title: "Listen to Anu's calls",
        detail:
          "A voice call from the website plays its recording on the call's page, so you hear what the customer actually said before you ring back.",
      },
      {
        kind: "new",
        title: "Categories and Our work",
        detail:
          "The Catalogue tab now covers products, categories and the website's work gallery. Open any of them to read it, and tap the pencil to edit.",
      },
      {
        kind: "new",
        title: "Activity on every record",
        detail: "Quotations, products, enquiries and customers show who created and changed them, and when.",
      },
      {
        kind: "improved",
        title: "Easier to read outdoors",
        detail: "Warning, success and error text is darker on its tinted background, so it stays readable in sunlight.",
      },
      {
        kind: "fixed",
        title: "Empty lists on Android",
        detail: "The tabs could show a title and nothing under it. Every list now loads its rows.",
      },
    ],
  },
  {
    id: "1.0",
    version: "1.0",
    date: "2026-09-06",
    title: "The first Ortex Sales app",
    summary: "Quotations, leads, products and customers, built for the field.",
    items: [
      {
        kind: "new",
        title: "Quotations",
        detail:
          "Create a quotation in three steps: who it is for, what they want and how much. GST is worked out for you and the tax type is stated in words. Share the PDF on WhatsApp.",
      },
      {
        kind: "new",
        title: "Leads",
        detail: "Website enquiries and Anu's voice calls in one place, with advice on what to ask before you call.",
      },
      {
        kind: "new",
        title: "Customers",
        detail:
          "An A to Z list with favourites. Swipe right to call, left to WhatsApp, and open a customer to see their quotations and enquiries.",
      },
      {
        kind: "new",
        title: "Works with a weak signal",
        detail: "Lists keep a saved copy and say how old it is when the connection drops. Your quotation draft is kept on the phone.",
      },
      {
        kind: "new",
        title: "Fingerprint lock",
        detail: "Keep the app locked when you step away, from Profile, Security.",
      },
    ],
  },
]
