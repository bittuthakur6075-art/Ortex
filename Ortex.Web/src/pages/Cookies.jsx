import { useEffect, useState } from "react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { getConsent, setConsent, CONSENT_EVENT, CONSENT_GRANTED, CONSENT_DENIED } from "../lib/consent"

// The visitor's current analytics choice with buttons to change it. Read
// after mount: the page is prerendered, and the choice lives in the browser.
function ConsentControl() {
  const [choice, setChoice] = useState(undefined)
  useEffect(() => {
    setChoice(getConsent())
    const onChange = () => setChoice(getConsent())
    window.addEventListener(CONSENT_EVENT, onChange)
    return () => window.removeEventListener(CONSENT_EVENT, onChange)
  }, [])

  const label =
    choice === undefined
      ? "Checking your choice…"
      : choice === CONSENT_GRANTED
        ? "You have accepted analytics."
        : choice === CONSENT_DENIED
          ? "You have declined analytics. Only an anonymous count of the pages you open is kept."
          : "You have not chosen yet. Until you accept, only an anonymous count of the pages you open is kept."

  return (
    <div className="bg-secondary p-4 rounded-lg border border-border text-sm" aria-live="polite">
      <p className="font-semibold text-foreground">Change analytics choice</p>
      <p className="text-muted-foreground mt-1">{label}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setConsent(CONSENT_GRANTED)}
          disabled={choice === CONSENT_GRANTED}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          Accept analytics
        </button>
        <button
          type="button"
          onClick={() => setConsent(CONSENT_DENIED)}
          disabled={choice === CONSENT_DENIED}
          className="px-4 py-2 border border-border text-foreground rounded-lg font-semibold hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          Decline analytics
        </button>
      </div>
    </div>
  )
}

export default function Cookies() {
  useDocumentMetadata(
    "Cookie Policy | Ortex Industries",
    "How the Ortex Industries website uses cookies and browser storage, what each one does, and how to accept, decline or clear them at any time.",
    { path: "/cookies" }
  )

  const cookieInfo = [
    {
      title: "1. This Website Does Not Set Cookies",
      content: "Ortex Industries does not set any HTTP cookies, and we do not use Google Analytics, Meta Pixel, advertising pixels, or any third-party advertising or retargeting network. We do use two browser storage mechanisms that behave similarly, and this policy explains exactly what they hold. When you start a call with Alisha, Cloudflare Turnstile checks your browser to keep out automated abuse, and processes technical signals such as your IP address and browser characteristics under Cloudflare's privacy policy."
    },
    {
      title: "2. Browser Storage We Use",
      content: "(a) localStorage: your analytics consent choice, a randomly generated visitor identifier (e.g. 'usr_k3f9a2b1x') only once you have accepted analytics (declining deletes it), and, only if a submission fails to reach our servers, a temporary copy of your own enquiry so it can be re-sent rather than lost. (b) sessionStorage: a random session identifier, only once you have accepted analytics, and, only if you speak with our voice assistant Alisha, a short note of that conversation (the details you gave, such as your name and WhatsApp number, and its last few lines) so she can continue where you left off if you reopen her, plus a copy of an enquiry from that call that could not reach our servers yet. Both are discarded when you close the tab, and the conversation note and that copy are also cleared after two hours. Until you accept analytics nothing identifies you in storage at all: an enquiry you send then carries a random identifier held only in the open page, so our team can tell your messages apart, and it is gone when you leave. Apart from the enquiry copies, these items never contain your name, email or password, and nothing in either is transmitted to any advertiser."
    },
    {
      title: "3. Anonymous Page Counts and Optional Analytics",
      content: "Every visitor: we count which pages of this website are opened, with the time, the kind of device (mobile, tablet or desktop) and the name of the site you came from (for example google.com, never the full address). This count carries no identifier and nothing that could single you out: no IP address is stored or looked up, no browser or operating system details, no search words and nothing is kept in your browser for it. It only tells us which pages people read. If, and only if, you press 'Accept analytics' on our consent banner or on this page, we also record the pages you visit and what you search for in our catalogue, your device type, browser, operating system and referring site, under the random visitor identifier above, together with your public IP address and what an IP lookup derives from it: approximate city, region, country, postal code, internet provider and approximate coordinates. The lookup is performed by ipapi.co (with ipwho.is as a fallback when ipapi.co is unavailable), which means your IP address is disclosed to that provider. Records are stored on our infrastructure at Supabase. Until you accept, or once you decline, only the anonymous page count is kept: no request is made to either provider, no IP address is stored and no location is derived."
    },
    {
      title: "4. Changing or Withdrawing Your Choice",
      content: "You can change or withdraw your choice at any time with the buttons below. Declining stops the full analytics at once and deletes the stored visitor and session identifiers; only the anonymous page count described above continues. Clearing this site's data in your browser settings also removes the stored choice, and the consent banner then appears again. Declining analytics does not affect any functionality: the quote builder, calculator and contact forms all work exactly the same. You may also block browser storage entirely, though the site will then be unable to preserve an enquiry that fails to submit."
    }
  ]

  return (
    <div className="py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-left">
      <div className="hero-in space-y-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Cookie Policy</h1>
          <p className="mt-2 text-muted-foreground">Last updated: 24 October 2026</p>
        </div>

        <p className="text-foreground leading-relaxed text-base">
          This Cookie Policy explains what Ortex Industries stores in your browser and what we
          collect when you use this website. We have written it to describe our actual behaviour
          rather than a generic template. If you find a discrepancy, please tell us and we will
          correct it.
        </p>

        <div className="space-y-6">
          {cookieInfo.map((item) => (
            <div key={item.title} className="border-t border-border pt-6">
              <h2 className="text-xl font-semibold text-foreground mb-3">{item.title}</h2>
              <p className="text-muted-foreground leading-relaxed text-sm">
                {item.content}
              </p>
            </div>
          ))}
          <ConsentControl />
        </div>

        <div className="border-t border-border pt-6 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">5. Policy Updates and Contact</h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            We may update this policy periodically to reflect changes in our technology or compliance guidelines. For inquiries regarding cookie usage, contact:
          </p>
          <div className="bg-secondary p-4 rounded-lg border border-border text-sm">
            <p className="font-semibold text-foreground">Ortex Industries Compliance Group</p>
            <p className="text-muted-foreground mt-1">Email: <a href="mailto:sales@ortexindustries.in" className="text-primary hover:underline font-medium">sales@ortexindustries.in</a></p>
          </div>
        </div>
      </div>
    </div>
  )
}
