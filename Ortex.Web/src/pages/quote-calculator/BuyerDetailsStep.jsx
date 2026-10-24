import { ShieldTick, DocumentUpload } from "iconsax-react"
import { ArrowRight, ChevronLeft, AlertTriangle, X } from "../../components/ui/Icons"
import { ARTWORK_ACCEPT, ARTWORK_HINT } from "../../lib/uploads"
import { whatsappLink } from "../../constants/site"
import { todayISO } from "./helpers"

// Reusable form styling pulled from the Contact page.
const fieldClass = "mt-2 w-full px-4 py-3 bg-[#F9FBFC] border border-[#EBEDF3] rounded-[20px] [corner-shape:squircle] text-foreground placeholder:text-[#4B5675] focus:border-primary/70 focus:bg-white outline-none transition-colors duration-200"
const errBorder = "border-destructive focus:border-destructive"
const optionalTag = <span className="font-normal text-[#636c85]"> Optional</span>
const labelClass = "block text-[16px] font-medium text-foreground"

function FieldError({ id, children }) {
  return children ? <p id={id} className="text-sm text-destructive mt-1.5">{children}</p> : null
}

// Step 2 contact form card.
export default function BuyerDetailsStep({
  belowMoq, contactData, setContactData, errors, clearError, submitState,
  handleFileUpload, clearFile, handleFormSubmit, onBack, whatsappMessage,
}) {
  // Editing a field clears its error, so a corrected field stops showing red.
  const set = (key) => (e) => {
    setContactData((p) => ({ ...p, [key]: e.target.value }))
    if (errors[key]) clearError(key)
  }
  const isSubmitting = submitState !== ""
  const errProps = (key) => ({
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby": errors[key] ? `calc-${key}-error` : undefined,
  })

  return (
    <div className="bg-card border border-[#EBEDF3] rounded-[24px] p-6 md:p-8">
      <h2 className="text-[22px] font-semibold text-foreground mb-1">Your details</h2>
      <p className="text-[15px] text-[#4B5675] mb-6">We'll use these to send your formal quotation.</p>

      {belowMoq.length > 0 && (
        <div className="flex items-start gap-3 p-4 mb-6 bg-amber-500/10 border border-amber-500/30 text-amber-800 rounded-xl">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-[13px]">
            {belowMoq.length} item{belowMoq.length > 1 ? "s are" : " is"} below the minimum order quantity. We can still quote these, but our team may confirm feasibility or suggest the nearest run size.
          </p>
        </div>
      )}

      <form onSubmit={handleFormSubmit} noValidate className="space-y-6">
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <label htmlFor="calc-name" className={labelClass}>Name</label>
            <input id="calc-name" type="text" name="name" autoComplete="name" required maxLength={200}
              value={contactData.name} onChange={set("name")}
              placeholder="Full name" {...errProps("name")}
              className={`${fieldClass} ${errors.name ? errBorder : ""}`} />
            <FieldError id="calc-name-error">{errors.name}</FieldError>
          </div>
          <div>
            <label htmlFor="calc-email" className={labelClass}>Email</label>
            <input id="calc-email" type="email" name="email" autoComplete="email" inputMode="email" required maxLength={254}
              value={contactData.email} onChange={set("email")}
              placeholder="your.email@example.com" {...errProps("email")}
              className={`${fieldClass} ${errors.email ? errBorder : ""}`} />
            <FieldError id="calc-email-error">{errors.email}</FieldError>
          </div>
          <div>
            <label htmlFor="calc-phone" className={labelClass}>Phone</label>
            <input id="calc-phone" type="tel" name="phone" autoComplete="tel" inputMode="tel" required maxLength={40}
              value={contactData.phone}
              onChange={(e) => set("phone")({ target: { value: e.target.value.replace(/[^\d+\-\s()]/g, "") } })}
              placeholder="+91 98765 43210" {...errProps("phone")}
              className={`${fieldClass} ${errors.phone ? errBorder : ""}`} />
            <FieldError id="calc-phone-error">{errors.phone}</FieldError>
          </div>
          <div>
            <label htmlFor="calc-company" className={labelClass}>Company name{optionalTag}</label>
            <input id="calc-company" type="text" name="organization" autoComplete="organization" maxLength={200}
              value={contactData.company} onChange={set("company")}
              placeholder="Your company name"
              className={fieldClass} />
          </div>
          <div>
            <label htmlFor="calc-city" className={labelClass}>Delivery city or PIN code{optionalTag}</label>
            <input id="calc-city" type="text" name="city" autoComplete="address-level2" maxLength={80}
              value={contactData.city} onChange={set("city")}
              placeholder="e.g. Pune or 411001"
              className={fieldClass} />
            <p className="text-[13px] text-[#636c85] mt-1.5">Sets the GST type on your quotation and the delivery estimate.</p>
          </div>
          <div>
            <label htmlFor="calc-neededBy" className={labelClass}>Needed by{optionalTag}</label>
            <input id="calc-neededBy" type="date" name="neededBy" min={todayISO()}
              value={contactData.neededBy} onChange={set("neededBy")} {...errProps("neededBy")}
              className={`${fieldClass} ${errors.neededBy ? errBorder : ""}`} />
            <FieldError id="calc-neededBy-error">{errors.neededBy}</FieldError>
          </div>
        </div>

        <div>
          <label htmlFor="calc-artwork" className={labelClass}>Upload logo / artwork{optionalTag}</label>
          {contactData.logoFileName ? (
            <div className="mt-2 flex items-center gap-3 rounded-[20px] [corner-shape:squircle] border border-[#EBEDF3] bg-[#F9FBFC] px-4 py-3">
              <DocumentUpload size={24} variant="Bulk" color="currentColor" className="text-primary shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{contactData.logoFileName}</span>
              <button type="button" onClick={clearFile} aria-label={`Remove ${contactData.logoFileName}`}
                className="w-9 h-9 shrink-0 grid place-items-center rounded-full text-[#78829D] hover:text-destructive hover:bg-destructive/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-center border-2 border-dashed border-[#EBEDF3] hover:border-primary/40 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 rounded-[20px] [corner-shape:squircle] p-8 bg-[#F9FBFC] hover:bg-white transition-colors relative">
              <input id="calc-artwork" type="file" accept={ARTWORK_ACCEPT} onChange={handleFileUpload}
                aria-describedby="calc-artwork-hint"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <div className="text-center pointer-events-none">
                <DocumentUpload size={30} variant="Bulk" color="currentColor" className="text-primary mx-auto mb-3" aria-hidden="true" />
                <p className="text-[17px] font-semibold text-foreground">Click to upload or drag &amp; drop</p>
                <p id="calc-artwork-hint" className="mt-1 text-[15px] font-normal text-[#636c85]">{ARTWORK_HINT}</p>
              </div>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="calc-message" className={labelClass}>Additional requirements{optionalTag}</label>
          <textarea id="calc-message" value={contactData.message} onChange={set("message")} maxLength={4000}
            placeholder="Colours, custom shapes, branding placement or packaging preferences…"
            className={`${fieldClass} min-h-[120px]`} />
        </div>

        <div className="pt-6 border-t border-border">
          <div className="flex flex-wrap-reverse gap-3 justify-between items-center">
            <button type="button" onClick={onBack}
              className="px-5 py-3 border border-border hover:border-foreground/40 text-foreground font-semibold rounded-full flex items-center gap-2 transition-colors cursor-pointer">
              <ChevronLeft className="h-4 w-4" /> Back to catalogue
            </button>
            <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}
              className="px-7 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60 disabled:pointer-events-none">
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                  {submitState}
                </>
              ) : <>Get my quote <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground flex items-center gap-1.5">
            <ShieldTick size={16} variant="Bulk" color="currentColor" className="text-primary shrink-0" aria-hidden="true" />
            No obligation. Our sales desk replies with a formal GST quotation. We never share your details.
          </p>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Prefer WhatsApp?{" "}
            <a href={whatsappLink(whatsappMessage)} target="_blank" rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline">
              Send this list on WhatsApp
            </a>
          </p>
        </div>
      </form>
    </div>
  )
}
