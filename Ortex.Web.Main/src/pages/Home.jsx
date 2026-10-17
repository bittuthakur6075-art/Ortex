import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import Hero from "../components/ui/Hero"
import PageCTA from "../components/ui/PageCTA"
import ContentIcon from "../components/ui/ContentIcons"
import { ArrowRight } from "../components/ui/Icons"
import { Section, SectionHeading, fadeUp, EASE } from "../components/ui/Section"
import { STATS, PILLARS, REASONS, CAPABILITIES, PORTFOLIO, CLIENTS, portfolioThumb } from "../constants/content"

const PILLAR_ICONS = { manufacturing: "bulk", customisation: "brush", reach: "export" }

function StatsBar() {
  return (
    <section className="py-12 bg-primary border-b border-white/10">
      <div className="lp-wrap">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map((stat, idx) => (
            <motion.div
              key={stat.label}
              {...fadeUp}
              transition={{ duration: 0.6, ease: EASE, delay: idx * 0.1 }}
              className="flex flex-col items-center text-center"
            >
              <div className="text-[26px] md:text-[32px] font-medium text-white leading-none">{stat.value}</div>
              <p className="text-[14px] md:text-[16px] font-medium uppercase text-white/60 mt-3 tracking-wide">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Sticky heading on the left, cards that pin and stack on the right (Ortex.Web's "How we build"). */
function Reasons() {
  return (
    <section className="relative section-y bg-white">
      <div className="lp-wrap">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-14 items-start">
          <div className="lg:sticky lg:top-28 self-start">
            <motion.div {...fadeUp}>
              <span className="block text-[14px] font-semibold uppercase tracking-[0.22em] text-primary mb-3">
                Why Ortex
              </span>
              <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
                Why businesses choose Ortex Industries
              </h2>
              <p className="mt-8 text-[18px] font-normal leading-relaxed text-foreground">
                We are manufacturers, not resellers. Owning the machines, the materials and the people means we can
                promise a finish, a price and a date, and keep all three.
              </p>
              <Link to="/about" className="lp-pill-btn outline mt-10">More about us</Link>
            </motion.div>
          </div>

          <div className="flex flex-col gap-6 lg:pb-[20vh]">
            {REASONS.map((item, index) => (
              <div
                key={item.title}
                className="lg:sticky bg-[#0b0b0d] ring-1 ring-white/10 p-[30px]"
                style={{ top: `calc(7rem + ${index * 16}px)` }}
              >
                <div className="flex items-baseline gap-5">
                  <span className="flex-none text-[18px] font-medium tracking-[0.3em] text-white tabular-nums">0{index + 1}</span>
                  <h3 className="text-[20px] md:text-[24px] font-semibold leading-tight text-white">{item.title}</h3>
                </div>
                <div className="overflow-hidden mt-7">
                  <img src={item.image} alt={item.title} loading="lazy" decoding="async" className="aspect-[4/2] w-full object-cover" />
                </div>
                <p className="mt-7 text-[16px] font-normal leading-relaxed text-white">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  useDocumentMetadata(
    "Ortex Industries | Customised Products Manufacturer, Delhi",
    "Ortex Industries manufactures customised MDF and acrylic products, lanyards, badges, exam boards and corporate gifts in-house in Delhi. PAN India and export.",
    { path: "/" }
  )

  const featured = PORTFOLIO.slice(0, 6)

  return (
    <>
      <Hero />
      <StatsBar />

      {/* Core capabilities */}
      <Section>
        <div className="lp-wrap">
          <SectionHeading eyebrow="What we do" title="Our core capabilities">
            Turning your ideas into finished, branded products, at any scale and to any brief.
          </SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[20px]">
            {PILLARS.map((p, idx) => (
              <motion.div
                key={p.key}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.08 }}
                className="bg-secondary p-[40px]"
              >
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

      <Reasons />

      {/* Everything we offer */}
      <Section tone="secondary">
        <div className="lp-wrap">
          <SectionHeading eyebrow="Built for B2B" title="Everything an order needs">
            The capacity of a factory with the attention of a small team.
          </SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[20px]">
            {CAPABILITIES.map((c, idx) => (
              <motion.div
                key={c.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: (idx % 3) * 0.08 }}
                className="bg-background p-[32px] flex gap-5"
              >
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

      {/* Recent work */}
      <Section>
        <div className="lp-wrap">
          <SectionHeading eyebrow="Recent work" title="Made on our floor">
            A few recent orders, photographed before dispatch.
          </SectionHeading>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-[12px] md:gap-[20px]">
            {featured.map((item, idx) => (
              <motion.figure
                key={item.image}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: (idx % 3) * 0.08 }}
                className="group"
              >
                <div className="overflow-hidden bg-secondary aspect-square">
                  <img
                    src={portfolioThumb(item.image)}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                </div>
                <figcaption className="mt-3 text-[15px] md:text-[17px] font-semibold text-foreground">{item.title}</figcaption>
              </motion.figure>
            ))}
          </div>

          <div className="mt-14 text-center">
            <p className="text-[14px] font-semibold uppercase tracking-[0.22em] text-[#78829D]">Trusted by teams at</p>
            <ul className="mt-5 flex flex-wrap justify-center gap-x-10 gap-y-3 text-[18px] md:text-[20px] font-medium text-foreground/80">
              {CLIENTS.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <Link to="/portfolio" className="group lp-pill-btn primary mt-10 gap-2">
              See the full portfolio
              <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </Section>

      <PageCTA
        title="Ready to bring your idea to life?"
        primary={{ to: "/contact", label: "Get a quote" }}
        secondary={{ to: "/products", label: "Browse products" }}
      >
        Tell us what you need and our team will reply with a customised quote within one working day.
      </PageCTA>
    </>
  )
}
