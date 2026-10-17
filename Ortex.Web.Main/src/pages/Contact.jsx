import useDocumentMetadata from "../hooks/useDocumentMetadata"
import PageCTA from "../components/ui/PageCTA"
import PageHero from "../components/ui/PageHero"
import ContactForm from "./contact/ContactForm"
import ContactInfoCards from "./contact/ContactInfoCards"
import DeliveryReach from "./contact/DeliveryReach"
import ContactFAQ from "./contact/ContactFAQ"
import useContactForm from "./contact/useContactForm"

export default function Contact() {
  useDocumentMetadata(
    "Contact Ortex Industries | Get a Quote",
    "Ask for a quote on customised MDF, acrylic, lanyards, badges and corporate gifts. Call +91-9211947188, email sales@ortexindustries.in or WhatsApp us.",
    { path: "/contact" }
  )

  const { formData, errors, isSubmitting, handleChange, handleSubmit } = useContactForm()

  return (
    <>
      <PageHero title="Get in touch">
        Have a project in mind? Tell us about it and a real person from our team will reply within one working day.
      </PageHero>

      <section className="pb-[72px] sm:pb-[96px] lg:pb-[140px] bg-background">
        <div className="relative aspect-[4/1] overflow-hidden">
          <img
            src="/img/contact-strip.webp"
            alt="Laser engraving a custom design in the Ortex Industries workshop"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      </section>

      <section className="pb-[72px] sm:pb-[96px] lg:pb-[140px] bg-background text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.35fr] gap-14 lg:gap-20">
            <ContactForm
              formData={formData}
              errors={errors}
              isSubmitting={isSubmitting}
              handleChange={handleChange}
              handleSubmit={handleSubmit}
            />
            <ContactInfoCards />
          </div>
        </div>
      </section>

      <ContactFAQ />

      <DeliveryReach />

      <PageCTA
        title="See it before you order"
        primary={{ to: "/portfolio", label: "View our portfolio" }}
        secondary={{ to: "/products", label: "Browse products" }}
      >
        Real products from our floor, made for clients across India.
      </PageCTA>
    </>
  )
}
