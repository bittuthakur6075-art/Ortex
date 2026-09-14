import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Save } from "../../components/ui/Icons"
import { Banner, Button, Card, Field, Input } from "../../components/ui/Ui"
import ListTextarea from "../../components/ui/ListTextarea"
import { useSettings } from "../../hooks/useCollection"
import useQuotationDefaults from "../../hooks/useQuotationDefaults"
import { normaliseDefault } from "../../lib/quotationDefaults"

// My own starting text for NEW quotations: payment terms, T&C and notes. The
// console's port of Ortex.Mobile's Profile > Quotation defaults, reading and
// writing the same `profiles.quotation_defaults` column, so they follow the
// person between the phone and the console.
//
// Personal, and said so: the company terms belong to Settings and only an admin
// changes them. Terms left as the company wrote them stay LINKED (stored as
// null), so when an admin updates the company terms this person's new
// quotations follow; "Use company terms" puts a field back to that link.
export default function QuotationDefaultsCard({ profile }) {
  const settings = useSettings()
  const { defaults, loaded, syncedToAccount, save } = useQuotationDefaults(profile)
  const companyTerms = settings?.quotation?.terms || ""

  const [paymentTerms, setPaymentTerms] = useState("")
  const [terms, setTerms] = useState("")
  const [notes, setNotes] = useState("")
  const [seeded, setSeeded] = useState(false)
  const [busy, setBusy] = useState(false)

  // Seed once both the stored defaults and the company terms have arrived.
  useEffect(() => {
    if (seeded || !loaded || !settings) return
    setPaymentTerms(defaults.paymentTerms ?? "")
    setTerms(defaults.terms ?? companyTerms)
    setNotes(defaults.notes ?? "")
    setSeeded(true)
  }, [seeded, loaded, settings, defaults, companyTerms])

  const next = {
    paymentTerms: normaliseDefault(paymentTerms, ""),
    terms: normaliseDefault(terms, companyTerms),
    notes: normaliseDefault(notes, ""),
  }
  const dirty = seeded && ["paymentTerms", "terms", "notes"].some((k) => next[k] !== (defaults[k] ?? null))
  const termsLinked = next.terms === null

  const submit = async () => {
    setBusy(true)
    try {
      const where = await save(next)
      toast.success(where === "account" ? "Quotation defaults saved to your account" : "Quotation defaults saved in this browser")
    } catch (e) {
      toast.error(`Could not save your defaults. ${e?.message || "Try again."}`)
    } finally {
      setBusy(false)
    }
  }

  const linkButton = (label, onPress) => (
    <Button variant="ghost" size="sm" className="text-primary" onClick={onPress}>
      {label}
    </Button>
  )

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-foreground">Quotation defaults</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your own starting text for every new quotation you create, here and on the Ortex Sales app. Existing quotations are never changed.
        </p>
      </div>

      {seeded && !syncedToAccount && (
        <Banner tone="warning" className="mb-4">
          Saved in this browser only, until the database update that syncs them to your account is applied.
        </Banner>
      )}

      <div className="space-y-4">
        <Field label="Payment terms" hint="Printed beside the totals. Leave empty to start blank.">
          <Input
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            placeholder="For example: 50% advance, balance before dispatch"
            disabled={!seeded}
          />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="text-sm text-foreground">Terms and conditions</label>
            {!termsLinked && companyTerms && linkButton("Use company terms", () => setTerms(companyTerms))}
          </div>
          <ListTextarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="Enter terms and conditions"
            className="min-h-[140px]"
            disabled={!seeded}
            maxLength={4000}
            hint={
              termsLinked
                ? "These are the company terms. When an admin updates them in Settings, your new quotations follow."
                : "Your own terms. New quotations use these instead of the company terms."
            }
            ai={{
              purpose:
                "Default terms and conditions for B2B quotations of custom manufactured products: validity, artwork approval, production after confirmation, delivery and taxes. One clause per line.",
              maxChars: 900,
            }}
          />
        </div>

        <Field label="Notes">
          <ListTextarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="For example: Artwork proof shared within 24 hours of order"
            className="min-h-[90px]"
            disabled={!seeded}
            maxLength={2000}
            hint="Printed under the totals. Leave empty to start blank."
            ai={{
              purpose: "Default notes printed on every new quotation, such as artwork proofs or samples. One note per line.",
              maxChars: 300,
            }}
          />
        </Field>
      </div>

      <Button size="sm" className="mt-5" onClick={submit} disabled={!dirty || busy}>
        <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save defaults"}
      </Button>
    </Card>
  )
}
