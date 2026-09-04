import { ShieldTick, DocumentUpload } from "iconsax-react"
import { ArrowRight, ChevronLeft, AlertTriangle } from "../../components/ui/Icons"
import { ARTWORK_ACCEPT, ARTWORK_HINT } from "../../lib/uploads"

// Reusable form styling pulled from the Contact page.
const fieldClass = "mt-2 w-full px-4 py-3 bg-[#F9FBFC] border border-[#EBEDF3] rounded-[20px] [corner-shape:squircle] text-foreground placeholder:text-[#4B5675] focus:border-primary/70 focus:bg-white outline-none transition-colors duration-200"
const errBorder = "border-destructive focus:border-destructive"
const optionalTag = <span className="font-normal text-[#78829D]"> Optional</span>

// Step 2 contact form card.
export default function BuyerDetailsStep({
  belowMoq, contactData, setContactData, errors, isSubmitting,
  handleFileUpload, handleFormSubmit, setStep,
}) {
  return (
    <div className="bg-card border border-[#EBEDF3] rounded-[24px] p-6 md:p-8">
      <h2 className="text-[22px] font-semibold text-foreground mb-1">Your details</h2>
      <p className="text-[15px] text-[#4B5675] mb-6">We'll use these to send your formal quotation.</p>

      {belowMoq.length > 0 && (
        <div className="flex items-start gap-3 p-4 mb-6 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-xs">
            {belowMoq.length} item{belowMoq.length > 1 ? "s are" : " is"} below the minimum order quantity. We can still quote these, but our team may confirm feasibility or suggest the nearest run size.
          </p>
        </div>
      )}

      <form onSubmit={handleFormSubmit} noValidate className="space-y-6">
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <label htmlFor="calcName" className="block text-[16px] font-medium text-foreground">Name</label>
            <input id="calcName" type="text" name="name" autoComplete="name" required
              value={contactData.name}
              onChange={(e) => setContactData((p) => ({ ...p, name: e.target.value }))}
              placeholder="Full name"
              aria-invalid={Boolean(errors.name)}
              className={`${fieldClass} ${errors.name ? errBorder : ""}`} />
            {errors.name && <p className="text-sm text-destructive mt-1.5">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="calcEmail" className="block text-[16px] font-medium text-foreground">Email</label>
            <input id="calcEmail" type="email" name="email" autoComplete="email" inputMode="email" required
              value={contactData.email}
              onChange={(e) => setContactData((p) => ({ ...p, email: e.target.value }))}
              placeholder="your.email@example.com"
              aria-invalid={Boolean(errors.email)}
              className={`${fieldClass} ${errors.email ? errBorder : ""}`} />
            {errors.email && <p className="text-sm text-destructive mt-1.5">{errors.email}</p>}
          </div>
          <div>
            <label htmlFor="calcPhone" className="block text-[16px] font-medium text-foreground">Phone</label>
            <input id="calcPhone" type="tel" name="phone" autoComplete="tel" inputMode="tel" required
              value={contactData.phone}
              onChange={(e) => setContactData((p) => ({ ...p, phone: e.target.value.replace(/[^\d+\-\s()]/g, "") }))}
              placeholder="+91-XXXXXXXXXX"
              aria-invalid={Boolean(errors.phone)}
              className={`${fieldClass} ${errors.phone ? errBorder : ""}`} />
            {errors.phone && <p className="text-sm text-destructive mt-1.5">{errors.phone}</p>}
          </div>
          <div>
            <label htmlFor="calcCompany" className="block text-[16px] font-medium text-foreground">Company name{optionalTag}</label>
            <input id="calcCompany" type="text" name="organization" autoComplete="organization"
              value={contactData.company}
              onChange={(e) => setContactData((p) => ({ ...p, company: e.target.value }))}
              placeholder="Your company name"
              className={fieldClass} />
          </div>
        </div>

        <div>
          <label className="block text-[16px] font-medium text-foreground">Upload logo / artwork{optionalTag}</label>
          <div className="mt-2 flex items-center justify-center border-2 border-dashed border-[#EBEDF3] hover:border-primary/40 rounded-[20px] [corner-shape:squircle] p-8 bg-[#F9FBFC] hover:bg-white transition-colors relative">
            <input type="file" accept={ARTWORK_ACCEPT} onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="text-center">
              <DocumentUpload size={30} variant="Bulk" color="currentColor" className="text-primary mx-auto mb-3" aria-hidden="true" />
              <p className="text-[18px] font-semibold text-foreground">
                {contactData.logoFileName
                  ? <span className="text-primary">{contactData.logoFileName}</span>
                  : <span>Click to upload or drag &amp; drop</span>}
              </p>
              <p className="mt-1 text-[16px] font-normal text-[#78829D]">{ARTWORK_HINT}</p>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="calcMessage" className="block text-[16px] font-medium text-foreground">Additional requirements{optionalTag}</label>
          <textarea id="calcMessage" value={contactData.message}
            onChange={(e) => setContactData((p) => ({ ...p, message: e.target.value }))}
            placeholder="Colours, custom shapes, branding placement, delivery timeline or packaging preferences…"
            className="mt-2 w-full px-4 py-3 bg-[#F9FBFC] border border-[#EBEDF3] rounded-[20px] [corner-shape:squircle] text-foreground placeholder:text-[#4B5675] focus:border-primary/70 focus:bg-white outline-none transition-colors duration-200 min-h-[120px]" />
        </div>

        <div className="pt-6 border-t border-border">
          <div className="flex flex-wrap-reverse gap-3 justify-between items-center">
            <button type="button" onClick={() => setStep(1)}
              className="px-5 py-3 border border-border hover:border-foreground/40 text-foreground font-semibold rounded-full flex items-center gap-2 transition-colors cursor-pointer">
              <ChevronLeft className="h-4 w-4" /> Back to catalogue
            </button>
            <button type="submit" disabled={isSubmitting}
              className="px-7 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none">
              {isSubmitting ? "Submitting…" : <>Get my quote <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground flex items-center gap-1.5">
            <ShieldTick size={16} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
            No obligation. Our sales desk replies with a formal GST quotation. We never share your details.
          </p>
        </div>
      </form>
    </div>
  )
}
