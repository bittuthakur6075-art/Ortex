import useDocumentMetadata from "../hooks/useDocumentMetadata"

export default function Cookies() {
  useDocumentMetadata(
    "Cookie Policy | Ortex Industries",
    "How the Ortex Industries website uses cookies and browser storage, what each one does, and how to accept, decline or clear them at any time.",
    { path: "/cookies" }
  )

  const cookieInfo = [
    {
      title: "1. This Website Does Not Set Cookies",
      content: "Ortex Industries does not set any HTTP cookies, and we do not use Google Analytics, Meta Pixel, advertising pixels, or any third-party advertising or retargeting network. We do use two browser storage mechanisms that behave similarly, and this policy explains exactly what they hold."
    },
    {
      title: "2. Browser Storage We Use",
      content: "(a) localStorage: a randomly generated visitor identifier (e.g. 'usr_k3f9a2b1x'), your theme preference, your analytics consent choice, and — only if a submission fails to reach our servers — a temporary copy of your own enquiry so it can be re-sent rather than lost. (b) sessionStorage: a random session identifier, and, only if you speak with our voice assistant Anu, a short note of that conversation (the details you gave, such as your name and WhatsApp number, and its last few lines) so she can continue where you left off if you reopen her. Both are discarded when you close the tab, and the conversation note is also cleared after two hours. The localStorage items never contain your name, email, or password, and nothing in either is transmitted to any advertiser."
    },
    {
      title: "3. Optional Analytics and IP-Based Location",
      content: "If, and only if, you press 'Accept analytics' on our consent banner, we record which pages you visit, your device type, browser, and referring site, together with your public IP address and the approximate city and region derived from it. The IP lookup is performed by ipapi.co (with api.ipify.org as a fallback), which means your IP address is disclosed to that provider. Records are stored on our infrastructure at Supabase. If you decline, no request is made to ipapi.co, no IP address is stored, and no location is derived."
    },
    {
      title: "4. Changing or Withdrawing Your Choice",
      content: "You can withdraw consent at any time by clearing this site's data in your browser settings, which removes the stored choice and causes the consent banner to appear again. Declining analytics does not affect any functionality — the quote builder, calculator, and contact forms all work exactly the same. You may also block browser storage entirely, though the site will then be unable to preserve an enquiry that fails to submit."
    }
  ]

  return (
    <div className="py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-left">
      <div className="hero-in space-y-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Cookie Policy</h1>
          <p className="mt-2 text-muted-foreground">Last updated: September 14, 2026</p>
        </div>

        <p className="text-foreground leading-relaxed text-base">
          This Cookie Policy explains what Ortex Industries stores in your browser and what we
          collect when you use this website. We have written it to describe our actual behaviour
          rather than a generic template — if you find a discrepancy, please tell us and we will
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
