import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowRight } from "../../components/ui/Icons"
import { Clock, ShieldTick, TickCircle } from "iconsax-react"
import { fadeUp, RevealWords } from "../../components/ui/Section"
import SelectField from "./SelectField"
import { productCategories } from "./helpers"

const fieldClass =
  "mt-1 w-full px-4 py-3 bg-[#F9FBFC] border border-[#EBEDF3] rounded-[20px] [corner-shape:squircle] text-foreground placeholder:text-[#4B5675] focus:border-primary/70 focus:bg-white outline-none transition-colors duration-200"
const labelClass = "block text-[16px] font-medium text-foreground capitalize"
const optionalTag = <span className="font-normal text-[#78829D]"> Optional</span>
const errorBorder = "border-destructive focus:border-destructive"

/** "Send a message" column: heading, enquiry form, submit and trust bullets. */
export default function ContactForm({ formData, errors, isSubmitting, handleChange, handleSubmit }) {
  return (
    <motion.div {...fadeUp} className="lg:order-2">
      <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
        Send a message
      </span>
      <h2 className="text-[36px] md:text-[52px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
        <RevealWords text="Tell us what you need" />
      </h2>
      <p className="mt-5 text-[18px] font-normal text-[#4b5675] leading-relaxed max-w-xl">
        Share a few details about your project and our team will get back to you personally within one working day.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-10 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="name" className={labelClass}>Full name</label>
            <input
              id="name"
              type="text"
              name="name"
              autoComplete="name"
              required
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Enter your full name"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "name-error" : undefined}
              className={`${fieldClass} ${errors.name ? errorBorder : ""}`}
            />
            {errors.name && <p id="name-error" className="text-sm text-destructive mt-1.5">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input
              id="email"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              required
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="Enter your email address"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={`${fieldClass} ${errors.email ? errorBorder : ""}`}
            />
            {errors.email && <p id="email-error" className="text-sm text-destructive mt-1.5">{errors.email}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="phone" className={labelClass}>Phone number</label>
            <input
              id="phone"
              type="tel"
              name="phone"
              autoComplete="tel"
              inputMode="tel"
              required
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value.replace(/[^\d+\-\s()]/g, ""))}
              placeholder="Enter your contact number"
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? "phone-error" : undefined}
              className={`${fieldClass} ${errors.phone ? errorBorder : ""}`}
            />
            {errors.phone && <p id="phone-error" className="text-sm text-destructive mt-1.5">{errors.phone}</p>}
          </div>

          <div>
            <label htmlFor="company" className={labelClass}>Company{optionalTag}</label>
            <input
              id="company"
              type="text"
              name="organization"
              autoComplete="organization"
              value={formData.company}
              onChange={(e) => handleChange("company", e.target.value)}
              placeholder="Enter your company name"
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="productInterest" className={labelClass}>What can we make for you?</label>
          <SelectField
            id="productInterest"
            value={formData.productInterest}
            placeholder="Select a product category"
            options={productCategories}
            onChange={(val) => handleChange("productInterest", val)}
            invalid={Boolean(errors.productInterest)}
          />
          {errors.productInterest && <p className="text-sm text-destructive mt-1.5">{errors.productInterest}</p>}
        </div>

        <div>
          <label htmlFor="message" className={labelClass}>Project details</label>
          <textarea
            id="message"
            name="message"
            required
            value={formData.message}
            onChange={(e) => handleChange("message", e.target.value)}
            placeholder="Tell us quantities, sizes, materials, and deadlines, and share any artwork you have. The more detail, the faster we quote."
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? "message-error" : undefined}
            className={`${fieldClass} min-h-[140px] resize-y ${errors.message ? errorBorder : ""}`}
          />
          {errors.message && <p id="message-error" className="text-sm text-destructive mt-1.5">{errors.message}</p>}
        </div>

        <div className="flex flex-col gap-4 items-start">
          <button
            type="submit"
            disabled={isSubmitting}
            className="group flex-shrink-0 w-full sm:w-auto px-8 py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none cursor-pointer"
          >
            {isSubmitting ? "Sending..." : "Send my enquiry"}
            {!isSubmitting && <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1" />}
          </button>
          <p className="text-[14px] font-normal leading-relaxed text-[#4B5675]">
            By sending this enquiry, you agree to our{" "}
            <Link to="/terms" className="text-primary font-medium hover:underline">Terms</Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-primary font-medium hover:underline">Privacy Policy</Link>.
          </p>

          <div className="flex flex-col gap-2.5">
            {[
              { icon: Clock, text: "Replies within one working day, straight from our team." },
              { icon: ShieldTick, text: "Your details stay private, never shared or sold." },
              { icon: TickCircle, text: "No spam and no sales calls, just a straight quote." },
            ].map(({ icon: Icon, text }) => (
              <p key={text} className="flex items-center gap-2.5 text-[16px] font-medium text-foreground">
                <Icon size={20} color="currentColor" variant="Bulk" className="flex-shrink-0 text-primary" aria-hidden="true" />
                {text}
              </p>
            ))}
          </div>
        </div>
      </form>
    </motion.div>
  )
}
