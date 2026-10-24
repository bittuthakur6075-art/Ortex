import { useState } from "react"
import { TickCircle } from "iconsax-react"
import { ArrowRight } from "./Icons"
import { submitEnquiry } from "../../lib/leads"
import { whatsappLink } from "../../constants/site"

const fieldClass =
  "w-full px-4 py-3 bg-background border border-[#EBEDF3] rounded-[14px] text-[15px] text-foreground placeholder:text-[#636c85] focus:border-primary/70 outline-none transition-colors duration-200"
const errorBorder = "border-destructive focus:border-destructive"

/** Ten digits once spaces, dashes and a leading +91 / 0 are dropped. */
const validMobile = (v) => /^\d{10}$/.test(v.replace(/[\s\-()]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, ""))

/**
 * "Get the price" form on a product page: name, mobile and quantity, nothing
 * else required. A buyer who lands from search can ask for a price without
 * the full quote wizard. It saves as a website enquiry naming the product and
 * quantity, so it lands in the console's Enquiries like the contact form.
 */
export default function QuickEnquiry({ product, category }) {
  const [form, setForm] = useState({ name: "", phone: "", quantity: "", email: "" })
  const [errors, setErrors] = useState({})
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(null)

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = "Please enter your name"
    if (!validMobile(form.phone)) next.phone = "Please enter a 10-digit mobile number"
    if (!(Number(form.quantity) >= 1)) next.quantity = "Roughly how many pieces?"
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = "Please check the email"
    setErrors(next)
    if (Object.keys(next).length) return

    setSending(true)
    // A number, so the console can turn the request into a quotation line.
    const quantity = Number(form.quantity)
    const items = [{ productId: product.id, name: product.name, sku: product.sku, category, unit: product.unit, quantity }]
    try {
      const res = await submitEnquiry({
        source: "Website contact form",
        customer: { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), company: "" },
        productInterest: category,
        items,
        message: `Price request from the product page: ${product.name}, quantity ${quantity.toLocaleString("en-IN")}.`,
        notes: JSON.stringify({ items, page: product.path }),
      })
      setDone(res)
    } catch {
      setDone({ failed: true })
    } finally {
      setSending(false)
    }
  }

  const followUp = whatsappLink(
    `Hi Ortex, I asked for a price for ${product.name} (quantity ${form.quantity.trim() || "to confirm"})${done?.reference ? `, reference ${done.reference}` : ""}.`
  )

  if (done) {
    return (
      <div className="mt-8 rounded-[6px] bg-secondary p-6" role="status">
        <div className="flex items-start gap-3">
          <TickCircle size={26} color="currentColor" variant="Bulk" className="text-primary flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="text-[17px] font-semibold text-foreground">
              {done.failed ? "We could not send that just now" : "Thanks, your price request is in"}
            </p>
            <p className="mt-1 text-[15px] text-muted-foreground leading-relaxed">
              {done.failed
                ? "Please send it on WhatsApp instead and our sales desk will reply there."
                : `Reference ${done.reference}. Our sales desk will call you within one working day${done.queued ? " (it will send automatically once you are back online)" : ""}. Want it faster? Message us on WhatsApp.`}
            </p>
            <a
              href={followUp}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-whatsapp text-[#071437] font-semibold text-[14px] hover:brightness-95 transition"
            >
              Continue on WhatsApp
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="mt-8 rounded-[6px] bg-secondary p-6" aria-labelledby="quick-enquiry-title">
      <h2 id="quick-enquiry-title" className="text-[18px] font-semibold text-foreground">Get the price for this product</h2>
      <p className="mt-1 text-[14px] text-muted-foreground">Three details, no obligation. Our sales desk calls you back within one working day.</p>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="qe-name" className="sr-only">Your name</label>
          <input id="qe-name" type="text" autoComplete="name" placeholder="Your name" maxLength={200} value={form.name}
            onChange={(e) => set("name", e.target.value)} aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "qe-name-error" : undefined}
            className={`${fieldClass} ${errors.name ? errorBorder : ""}`} />
          {errors.name && <p id="qe-name-error" className="text-[13px] text-destructive mt-1">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="qe-phone" className="sr-only">Mobile number</label>
          <input id="qe-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="Mobile number" maxLength={20} value={form.phone}
            onChange={(e) => set("phone", e.target.value.replace(/[^\d+\-\s()]/g, ""))} aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "qe-phone-error" : undefined}
            className={`${fieldClass} ${errors.phone ? errorBorder : ""}`} />
          {errors.phone && <p id="qe-phone-error" className="text-[13px] text-destructive mt-1">{errors.phone}</p>}
        </div>
        <div>
          <label htmlFor="qe-qty" className="sr-only">Quantity</label>
          <input id="qe-qty" type="text" inputMode="numeric" placeholder={`Quantity (min ${product.moq} ${product.unit})`} maxLength={9} value={form.quantity}
            onChange={(e) => set("quantity", e.target.value.replace(/\D/g, "").replace(/^0+/, ""))} aria-invalid={Boolean(errors.quantity)}
            aria-describedby={errors.quantity ? "qe-qty-error" : undefined}
            className={`${fieldClass} ${errors.quantity ? errorBorder : ""}`} />
          {errors.quantity && <p id="qe-qty-error" className="text-[13px] text-destructive mt-1">{errors.quantity}</p>}
        </div>
        <div>
          <label htmlFor="qe-email" className="sr-only">Email (optional)</label>
          <input id="qe-email" type="email" inputMode="email" autoComplete="email" placeholder="Email (optional)" maxLength={254} value={form.email}
            onChange={(e) => set("email", e.target.value)} aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "qe-email-error" : undefined}
            className={`${fieldClass} ${errors.email ? errorBorder : ""}`} />
          {errors.email && <p id="qe-email-error" className="text-[13px] text-destructive mt-1">{errors.email}</p>}
        </div>
      </div>
      <button
        type="submit"
        disabled={sending}
        className="group mt-4 w-full px-7 py-3.5 bg-foreground text-background hover:bg-foreground/90 font-semibold text-[15px] rounded-full inline-flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none cursor-pointer"
      >
        {sending ? "Sending..." : "Request a callback with the price"}
        {!sending && <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1" />}
      </button>
    </form>
  )
}
