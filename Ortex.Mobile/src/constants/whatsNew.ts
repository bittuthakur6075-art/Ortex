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
