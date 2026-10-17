import { motion } from "framer-motion"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import PageHero from "../components/ui/PageHero"
import PageCTA from "../components/ui/PageCTA"
import ContentIcon from "../components/ui/ContentIcons"
import { Section, SectionHeading, fadeUp } from "../components/ui/Section"
import { STATS, PILLARS, CAPABILITIES, FOUNDER } from "../constants/content"

const PILLAR_ICONS = { manufacturing: "bulk", customisation: "brush", reach: "export" }

export default function About() {
  useDocumentMetadata(
    "About Ortex Industries | In-house Custom Manufacturing",
    "Who we are, how we work and why schools, hospitals, brands and government offices across India trust Ortex Industries with their customised products.",
    { path: "/about" }
  )

  return (
    <>
      <PageHero title="About Ortex Industries">
        A Delhi manufacturer of customised products, trusted by businesses, institutions and agencies across India and abroad.
      </PageHero>

      {/* Story */}
      <section className="pb-[72px] sm:pb-[96px] lg:pb-[140px] bg-background">
        <div className="lp-wrap grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-center">
          <div className="hero-in">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">Our story</span>
            <h2 className="text-[36px] md:text-[52px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
              A manufacturer you can rely on
            </h2>
            <div className="mt-8 space-y-5 text-[18px] text-[#4b5675] leading-relaxed">
              <p>
                Ortex Industries began with a simple observation: businesses wanted customised products, but finding a
                partner who could deliver quality, flexibility and volume together was hard.
              </p>
              <p>
                So we built that partner. Our facility in Uttam Nagar, New Delhi houses the cutting, printing, engraving
                and finishing equipment, and the skilled team, to take an order from artwork to dispatch without handing
                it to anyone else.
              </p>
              <p>
                Today we make MDF and acrylic products, lanyards, badges, examination boards and corporate gifts for
                companies, schools, hospitals, government offices and agencies, many of whom have ordered from us again
                and again.
              </p>
            </div>
          </div>
          <div className="hero-in overflow-hidden">
            <img
              src="/img/about-production.avif"
              alt="Production on the Ortex Industries factory floor"
              fetchPriority="high"
              decoding="async"
              className="w-full aspect-[4/3] object-cover"
            />
          </div>
        </div>
      </section>

      {/* Numbers */}
      <section className="py-12 bg-primary">
        <div className="lp-wrap grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-[26px] md:text-[32px] font-medium text-white leading-none">{s.value}</div>
              <p className="text-[14px] md:text-[16px] font-medium uppercase text-white/60 mt-3 tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* A note from the owner (same text as Ortex.Web's founder note) */}
      <Section>
        <motion.figure {...fadeUp} className="lp-wrap max-w-3xl text-center">
          <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-6">
            A note from our owner
          </span>
          <blockquote className="flex flex-col gap-5">
            {FOUNDER.paragraphs.map((para, idx) => (
              <p
                key={para.slice(0, 24)}
                className={idx === 0
                  ? "text-[24px] md:text-[30px] font-medium leading-snug text-foreground text-balance"
                  : "text-[17px] text-[#4b5675] leading-relaxed"}
              >
                {para}
              </p>
            ))}
          </blockquote>
          <figcaption className="mt-10">
            <span className="block text-[17px] font-semibold text-foreground">{FOUNDER.name}</span>
            <span className="block text-[14px] text-[#78829D] mt-0.5">{FOUNDER.title}</span>
          </figcaption>
        </motion.figure>
      </Section>

      {/* Expertise */}
      <Section>
        <div className="lp-wrap">
          <SectionHeading eyebrow="Our expertise" title="What we bring to every order">
            The capabilities that let us say yes to unusual briefs and tight deadlines.
          </SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[20px]">
            {PILLARS.map((p, idx) => (
              <motion.div key={p.key} {...fadeUp} transition={{ ...fadeUp.transition, delay: idx * 0.08 }} className="bg-secondary p-[40px]">
                <div className="w-[50px] h-[50px] rounded-full bg-primary/10 grid place-items-center text-primary mb-6">
                  <ContentIcon name={PILLAR_ICONS[p.key]} />
                </div>
                <h3 className="text-[24px] font-semibold text-foreground">{p.title}</h3>
                <div className="mt-6 border-t border-primary/20" />
                <p className="mt-6 text-[16px] text-[#4b5675] leading-relaxed">{p.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Differentiators */}
      <Section tone="secondary">
        <div className="lp-wrap">
          <SectionHeading eyebrow="Why choose us" title="What makes us different">
            The reasons our clients give when they come back for their next order.
          </SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[20px]">
            {CAPABILITIES.map((c, idx) => (
              <motion.div key={c.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: (idx % 3) * 0.08 }} className="bg-background p-[32px] flex gap-5">
                <div className="flex-none w-[50px] h-[50px] rounded-full bg-primary/10 grid place-items-center text-primary">
                  <ContentIcon name={c.icon} />
                </div>
                <div>
                  <h3 className="text-[20px] font-semibold text-foreground">{c.title}</h3>
                  <p className="mt-2 text-[16px] text-[#4b5675] leading-relaxed">{c.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      <PageCTA
        title="Let's make something together"
        primary={{ to: "/contact", label: "Talk to our team" }}
        secondary={{ to: "/portfolio", label: "See our work" }}
      >
        Share your idea, quantity and deadline, and we will tell you exactly how we would make it.
      </PageCTA>
    </>
  )
}
