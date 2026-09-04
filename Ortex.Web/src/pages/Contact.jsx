import useDocumentMetadata from "../hooks/useDocumentMetadata"
import PageCTA from "../components/ui/PageCTA"
import PageHero from "../components/ui/PageHero"
import ContactForm from "./contact/ContactForm"
import ContactInfoCards from "./contact/ContactInfoCards"
import QuoteBanner from "./contact/QuoteBanner"
import DeliveryReach from "./contact/DeliveryReach"
import useContactForm from "./contact/useContactForm"

export default function Contact() {
  useDocumentMetadata(
    "Contact Ortex Industries | Get a Custom Product Quote",
    "Get a fast, factory-direct quote for custom MDF, acrylic, lanyards, badges, and corporate gifts. Call +91-9211947188, email sales@ortexindustries.in, or WhatsApp us. PAN India delivery and worldwide export.",
    { path: "/contact" }
  )

  const { formData, errors, isSubmitting, handleChange, handleSubmit } = useContactForm()

  return (
    <>
      {/* Page Header */}
      <PageHero title="We're here to help">
        Product question, custom project, or an order in motion,
        reach our team directly and a real person replies within one working day.
      </PageHero>

      {/* Full-width image strip below the hero (4:2) */}
      <section className="pb-[72px] sm:pb-[96px] lg:pb-[140px] bg-background">
        <div>
          <div className="relative aspect-[4/1] overflow-hidden">
            <img
              src="/img/contact-strip.jpg"
              alt="Laser engraving a custom design in the Ortex Industries workshop"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Form + contact channels */}
      <section className="pb-[72px] sm:pb-[96px] lg:pb-[140px] bg-background text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.35fr] gap-14 lg:gap-20">

            {/* Form Side */}
            <ContactForm
              formData={formData}
              errors={errors}
              isSubmitting={isSubmitting}
              handleChange={handleChange}
              handleSubmit={handleSubmit}
            />

            {/* Channels Side */}
            <ContactInfoCards />

          </div>
        </div>
      </section>

      {/* Already know your specs — full-width image banner with overlaid copy (OEM style) */}
      <QuoteBanner />

      {/* Where we deliver */}
      <DeliveryReach />

      {/* Closing CTA */}
      <PageCTA
        title="See it before you say it"
        primary={{ to: "/products", label: "Browse products" }}
        secondary={{ to: "/work", label: "View our work" }}
      >
        The full catalogue and real production shots, straight off the Ortex factory floor.
      </PageCTA>
    </>
  )
}
