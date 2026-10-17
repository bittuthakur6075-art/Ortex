import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import PageHero from "../components/ui/PageHero"
import PageCTA from "../components/ui/PageCTA"
import ContentIcon from "../components/ui/ContentIcons"
import { ArrowRight } from "../components/ui/Icons"
import { Section, SectionHeading, RevealWords, fadeUp } from "../components/ui/Section"
import { PRODUCTS, METHODS } from "../constants/content"
import { CATALOGUE_URL } from "../constants/site"

export default function Products() {
  useDocumentMetadata(
    "Products & Services | MDF, Acrylic, Lanyards | Ortex",
    "MDF and acrylic products, lanyards and ID accessories, badges, examination boards, clipboards and corporate gifts, all branded in-house by Ortex Industries.",
    { path: "/products" }
  )

  return (
    <>
      <PageHero
        title="Products and services"
        actions={
          <a href={CATALOGUE_URL} className="lp-pill-btn outline">Browse the full catalogue</a>
        }
      >
        A complete range of customised products, manufactured in-house and branded to your exact requirements.
      </PageHero>

      {/* Customisation intro */}
      <section className="pb-[72px] sm:pb-[96px] lg:pb-[140px] bg-background">
        <div className="lp-wrap grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-center">
          <motion.div {...fadeUp} className="overflow-hidden lg:order-2">
            <img
              src="/img/portfolio/mdf-ganesha-key-holder.webp"
              alt="UV-printed MDF key holder with a Ganesha design, made by Ortex Industries"
              loading="lazy"
              decoding="async"
              className="w-full aspect-[4/3] object-cover"
            />
          </motion.div>
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}>
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">Made to order</span>
            <h2 className="text-[36px] md:text-[52px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
              <RevealWords text="Every product, fully customised" />
            </h2>
            <div className="mt-8 space-y-5 text-[18px] text-[#4b5675] leading-relaxed">
              <p>
                Dimensions, shape, material, colour and branding are all decided by you. Send a sketch, a reference
                photo or finished artwork, and we will turn it into a production-ready proof.
              </p>
              <p>
                Our floor runs UV printing, laser engraving, sublimation and embossing side by side, so a single product
                can combine methods for exactly the finish you want.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Categories */}
      <Section tone="secondary">
        <div className="lp-wrap">
          <SectionHeading eyebrow="Our range" title="Product categories">
            Eight families of products, each available in your size, colours and branding.
          </SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[20px]">
            {PRODUCTS.map((p, idx) => (
              <motion.article
                key={p.slug}
                id={p.slug}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: (idx % 4) * 0.06 }}
                className="bg-background p-[32px] flex flex-col scroll-mt-28"
              >
                <div className="w-[50px] h-[50px] rounded-full bg-primary/10 grid place-items-center text-primary mb-6">
                  <ContentIcon name={p.icon} />
                </div>
                <h3 className="text-[20px] font-semibold text-foreground">{p.title}</h3>
                <p className="mt-3 text-[16px] text-[#4b5675] leading-relaxed flex-1">{p.description}</p>
                <Link
                  to={`/contact?interest=${encodeURIComponent(p.title)}`}
                  className="group mt-6 inline-flex items-center gap-1.5 min-h-[32px] text-[15px] font-semibold text-primary"
                >
                  Ask for a quote
                  <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </motion.article>
            ))}
          </div>
        </div>
      </Section>

      {/* Methods */}
      <Section>
        <div className="lp-wrap grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-start">
          <motion.div {...fadeUp} className="lg:sticky lg:top-28">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">How we brand</span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
              <RevealWords text="Branding and customisation services" />
            </h2>
            <div className="mt-10 overflow-hidden">
              <img
                src="/img/portfolio/mdf-wall-art.webp"
                alt="Custom-cut MDF wall art printed in full colour by Ortex Industries"
                loading="lazy"
                decoding="async"
                className="w-full aspect-[4/3] object-cover"
              />
            </div>
          </motion.div>
          <div className="flex flex-col">
            {METHODS.map((m, idx) => (
              <motion.div key={m.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: idx * 0.08 }} className="py-10 border-b border-border first:pt-0">
                <span className="text-[18px] font-medium tracking-[0.3em] text-primary tabular-nums">0{idx + 1}</span>
                <h3 className="mt-4 text-[28px] md:text-[32px] font-medium text-foreground">{m.title}</h3>
                <p className="mt-4 text-[18px] text-[#4b5675] leading-relaxed">{m.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      <PageCTA
        title="Not sure which product fits?"
        primary={{ to: "/contact", label: "Ask our team" }}
        secondary={{ to: "/portfolio", label: "See past orders" }}
      >
        Tell us the occasion, the audience and the budget, and we will suggest what works best.
      </PageCTA>
    </>
  )
}
