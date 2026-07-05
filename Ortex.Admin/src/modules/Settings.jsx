import { useState, useEffect } from "react"
import { Building2, KeyRound, Percent, Hash, Database, Sparkles, Trash2, Info, Save, Mail, Inbox } from "../components/icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { useSettings, useCollections } from "../data/hooks"
import { seedDemo } from "../data/seed"
import { login, changePassword, currentEmail } from "../lib/auth"
import { syncIndiaMart } from "../data/integrations"
import { GST_RATES } from "../data/schema"
import PageHeader from "../components/PageHeader"
import { Button, Card, Input, Select, Textarea, Field, PageLoader } from "../components/ui"

function SettingsCard({ icon: Icon, title, description, tone = "primary", children }) {
  const toneClass = tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </Card>
  )
}

export default function Settings() {
  const settings = useSettings()
  const { data } = useCollections(["products", "enquiries", "quotations", "invoices", "payments"])
  const [draft, setDraft] = useState(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (settings) setDraft(structuredClone(settings))
  }, [settings])

  if (!settings || !draft) return <PageLoader />

  const setCompany = (key, v) => setDraft((d) => ({ ...d, company: { ...d.company, [key]: v } }))
  const setTax = (key, v) => setDraft((d) => ({ ...d, tax: { ...d.tax, [key]: v } }))
  const setNumbering = (key, v) => setDraft((d) => ({ ...d, numbering: { ...d.numbering, [key]: v } }))
  const setQuotation = (key, v) => setDraft((d) => ({ ...d, quotation: { ...d.quotation, [key]: v } }))
  const setNotifications = (key, v) => setDraft((d) => ({ ...d, notifications: { ...d.notifications, [key]: v } }))
  const setEmailjs = (key, v) => setDraft((d) => ({ ...d, notifications: { ...d.notifications, emailjs: { ...d.notifications.emailjs, [key]: v } } }))
  const setIndiamart = (key, v) =>
    setDraft((d) => ({ ...d, integrations: { ...d.integrations, indiamart: { ...d.integrations.indiamart, [key]: v } } }))

  const saveSettings = async () => {
    await repo.saveSettings(draft)
    toast.success("Settings saved")
  }

  const syncIndiaMartNow = async () => {
    setSyncing(true)
    await repo.saveSettings(draft) // persist the latest key before the server pulls
    const res = await syncIndiaMart()
    setSyncing(false)
    if (res.error) return toast.error(res.error)
    if (res.skipped) return toast.message(res.reason || "IndiaMART sync is off")
    toast.success(`IndiaMART: ${res.inserted} new lead(s) imported${res.duplicates ? `, ${res.duplicates} already had` : ""}`)
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Company profile, tax, numbering and data">
        <Button size="sm" onClick={saveSettings}>
          <Save className="h-4 w-4" /> Save settings
        </Button>
      </PageHeader>

      <div className="space-y-4">
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 flex-none text-blue-500" />
            <p className="text-sm text-foreground">
              This console is fully client-side — all data lives in this browser&apos;s{" "}
              <span className="font-mono text-xs">localStorage</span>. It is API-ready: swap the store implementation in{" "}
              <span className="font-mono text-xs">data/repository.js</span> to move to a real backend. Payment gateways,
              vendor payouts and GST e-invoicing (IRN) require that backend.
            </p>
          </div>
        </div>

        <SettingsCard icon={Building2} title="Company profile" description="Appears on quotation and invoice documents.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company name">
              <Input value={draft.company.name} onChange={(e) => setCompany("name", e.target.value)} />
            </Field>
            <Field label="Tagline">
              <Input value={draft.company.tagline} onChange={(e) => setCompany("tagline", e.target.value)} />
            </Field>
            <Field label="Email">
              <Input value={draft.company.email} onChange={(e) => setCompany("email", e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={draft.company.phone} onChange={(e) => setCompany("phone", e.target.value)} />
            </Field>
            <Field label="GSTIN">
              <Input value={draft.company.gstin} onChange={(e) => setCompany("gstin", e.target.value)} />
            </Field>
            <Field label="State code" hint="Home state for CGST/SGST vs IGST">
              <Input value={draft.company.stateCode} onChange={(e) => setCompany("stateCode", e.target.value)} placeholder="07" />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input value={draft.company.address} onChange={(e) => setCompany("address", e.target.value)} />
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Bank name">
              <Input value={draft.company.bankName} onChange={(e) => setCompany("bankName", e.target.value)} />
            </Field>
            <Field label="Account number">
              <Input value={draft.company.bankAccount} onChange={(e) => setCompany("bankAccount", e.target.value)} />
            </Field>
            <Field label="IFSC">
              <Input value={draft.company.bankIfsc} onChange={(e) => setCompany("bankIfsc", e.target.value)} />
            </Field>
            <Field label="UPI ID">
              <Input value={draft.company.upi} onChange={(e) => setCompany("upi", e.target.value)} placeholder="name@bank" />
            </Field>
          </div>
        </SettingsCard>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SettingsCard icon={Percent} title="Tax defaults" description="Default GST rate for new lines.">
            <Field label="Default GST rate">
              <Select value={draft.tax.defaultGstRate} onChange={(e) => setTax("defaultGstRate", Number(e.target.value))}>
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </Select>
            </Field>
          </SettingsCard>

          <SettingsCard icon={Hash} title="Document numbering" description="Prefixes for quotes, invoices & payments.">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Quotation">
                <Input value={draft.numbering.quotationPrefix} onChange={(e) => setNumbering("quotationPrefix", e.target.value)} />
              </Field>
              <Field label="Invoice">
                <Input value={draft.numbering.invoicePrefix} onChange={(e) => setNumbering("invoicePrefix", e.target.value)} />
              </Field>
              <Field label="Payment">
                <Input value={draft.numbering.paymentPrefix} onChange={(e) => setNumbering("paymentPrefix", e.target.value)} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Format: PREFIX-FY-0001 (e.g. QTN-2526-0007). Resets each financial year.</p>
          </SettingsCard>
        </div>

        <SettingsCard icon={Percent} title="Default quotation terms" description="Pre-filled on new quotations.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Field label="Validity (days)">
              <Input type="number" min="1" value={draft.quotation.validityDays} onChange={(e) => setQuotation("validityDays", Number(e.target.value))} />
            </Field>
            <Field label="Terms & conditions" className="sm:col-span-3">
              <Textarea value={draft.quotation.terms} onChange={(e) => setQuotation("terms", e.target.value)} className="min-h-[120px]" />
            </Field>
          </div>
        </SettingsCard>

        <SettingsCard
          icon={Mail}
          title="Invoice email notifications"
          description="Email a copy of every generated invoice. With no EmailJS keys, your mail client opens pre-composed; with keys, it sends silently from the browser."
        >
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={!!draft.notifications.invoiceEmailEnabled}
              onChange={(e) => setNotifications("invoiceEmailEnabled", e.target.checked)}
            />
            Email a copy when an invoice is generated
          </label>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Recipient email (to)" hint="Where the invoice copy is sent">
              <Input
                type="email"
                value={draft.notifications.recipient}
                onChange={(e) => setNotifications("recipient", e.target.value)}
                placeholder="accounts@ortexindustries.in"
              />
            </Field>
            <Field label="Sender email (from)" hint="Company reply address shown as sender — applied on the EmailJS path">
              <Input
                type="email"
                value={draft.notifications.sender}
                onChange={(e) => setNotifications("sender", e.target.value)}
                placeholder="noreply@ortexindustries.in"
              />
            </Field>
          </div>
          <p className="mt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            EmailJS (optional — for silent sending)
          </p>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Service ID">
              <Input value={draft.notifications.emailjs.serviceId} onChange={(e) => setEmailjs("serviceId", e.target.value)} />
            </Field>
            <Field label="Template ID">
              <Input value={draft.notifications.emailjs.templateId} onChange={(e) => setEmailjs("templateId", e.target.value)} />
            </Field>
            <Field label="Public key">
              <Input value={draft.notifications.emailjs.publicKey} onChange={(e) => setEmailjs("publicKey", e.target.value)} />
            </Field>
          </div>
        </SettingsCard>

        <SettingsCard
          icon={Inbox}
          title="IndiaMART leads"
          description="Auto-import buyer enquiries from IndiaMART into the Enquiries module."
        >
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={!!draft.integrations.indiamart.enabled}
              onChange={(e) => setIndiamart("enabled", e.target.checked)}
            />
            Enable IndiaMART lead sync
          </label>
          <div className="mt-4 max-w-xl">
            <Field label="IndiaMART CRM / Pull API key" hint="From IndiaMART → Lead Manager → CRM Integration">
              <Input
                type="password"
                value={draft.integrations.indiamart.crmKey}
                onChange={(e) => setIndiamart("crmKey", e.target.value)}
                placeholder="Paste your IndiaMART key"
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" onClick={syncIndiaMartNow} disabled={syncing || !draft.integrations.indiamart.crmKey}>
              <Inbox className="h-4 w-4" /> {syncing ? "Syncing…" : "Save & sync now"}
            </Button>
            {draft.integrations.indiamart.lastResult && (
              <span className="text-xs text-muted-foreground">
                Last sync: {draft.integrations.indiamart.lastResult}
                {draft.integrations.indiamart.lastPull ? ` · ${new Date(draft.integrations.indiamart.lastPull).toLocaleString("en-IN")}` : ""}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Paste your key, enable, then click <strong>Save & sync now</strong> to import. Automatic scheduled sync can be turned on separately.
          </p>
        </SettingsCard>

        <PasswordCard />

        <SettingsCard icon={Database} title="Data" description="Storage overview and demo data.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Products", data.products?.length || 0],
              ["Enquiries", data.enquiries?.length || 0],
              ["Quotations", data.quotations?.length || 0],
              ["Invoices", data.invoices?.length || 0],
              ["Payments", data.payments?.length || 0],
            ].map(([label, count]) => (
              <div key={label} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-2xl font-bold text-foreground">{count}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await seedDemo()
                toast.success("Demo data loaded")
              }}
            >
              <Sparkles className="h-4 w-4" /> Load demo data
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard icon={Trash2} tone="danger" title="Danger zone" description="Permanently delete everything stored in this browser.">
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              if (window.confirm("Delete ALL data — products, enquiries, quotations, invoices, payments and settings? This cannot be undone.")) {
                await repo.clearAll()
                toast.success("All data cleared")
              }
            }}
          >
            Clear all data
          </Button>
        </SettingsCard>
      </div>
    </div>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")

  const submit = async (e) => {
    e.preventDefault()
    if (next.length < 6) return toast.error("New password must be at least 6 characters")
    if (next !== confirm) return toast.error("Passwords do not match")
    // Verify the current password by re-authenticating, then update it.
    const check = await login(currentEmail() || "", current)
    if (check.error) return toast.error("Current password is incorrect")
    const res = await changePassword(next)
    if (res?.error) return toast.error(res.error)
    setCurrent("")
    setNext("")
    setConfirm("")
    toast.success("Password updated")
  }

  return (
    <SettingsCard icon={KeyRound} title="Account password" description="Change the password you sign in with.">
      <form onSubmit={submit} className="grid max-w-md gap-3">
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" autoComplete="current-password" />
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" autoComplete="new-password" />
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" />
        <Button type="submit" size="sm" className="justify-self-start">
          Update password
        </Button>
      </form>
    </SettingsCard>
  )
}
