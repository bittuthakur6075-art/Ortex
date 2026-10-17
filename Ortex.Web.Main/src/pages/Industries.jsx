import { motion } from "framer-motion"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import PageHero from "../components/ui/PageHero"
import PageCTA from "../components/ui/PageCTA"
import ContentIcon from "../components/ui/ContentIcons"
import { Section, SectionHeading, RevealWords, fadeUp } from "../components/ui/Section"
import { INDUSTRIES, STATS } from "../constants/content"

export default function Industries() {
  useDocumentMetadata(
    "Industries We Serve | Ortex Industries",
    "Customised products for corporates, schools, government departments, hospitals, events, agencies, NGOs, campaigns, retail and professional firms.",
    { path: "/industries" }
  )

  return (
    <>
      <PageHero title="Industries we serve">
        Customised products for the sectors we know best, made to the standards each one expects.
      </PageHero>

      <section className="pb-[72px] sm:pb-[96px] lg:pb-[140px] bg-background">
        <div className="lp-wrap grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-center">
          <motion.div {...fadeUp}>
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">Across sectors</span>
            <h2 className="text-[36px] md:text-[52px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
              <RevealWords text="Trusted by organisations of every kind" />
            </h2>
            <div className="mt-8 space-y-5 text-[18px] text-[#4b5675] leading-relaxed">
              <p>
                A hospital needs ID badges that survive daily cleaning. A school needs exam boards that last years. A
                brand launch needs giveaways that arrive before the event, not after it.
              </p>
              <p>
                We have made products for all of them, and we bring that experience to your brief: the right material,
                the right finish and a realistic timeline from the first conversation.
              </p>
            </div>
          </motion.div>
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="overflow-hidden">
            <img
              src="/img/welcome-workshop.avif"
              alt="Customised products being prepared in the Ortex Industries workshop"
              loading="lazy"
              decoding="async"
              className="w-full aspect-[4/3] object-cover"
            />
          </motion.div>
        </div>
      </section>

      <Section tone="secondary">
        <div className="lp-wrap">
          <SectionHeading eyebrow="Sectors" title="Who we make for">
            Ten sectors we serve regularly, and the products they order most.
          </SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-[20px]">
            {INDUSTRIES.map((ind, idx) => (
              <motion.div
                key={ind.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: (idx % 5) * 0.05 }}
                className="bg-background p-[28px]"
              >
                <div className="w-[50px] h-[50px] rounded-full bg-primary/10 grid place-items-center text-primary mb-5">
                  <ContentIcon name={ind.icon} />
                </div>
                <h3 className="text-[19px] font-semibold text-foreground">{ind.title}</h3>
                <p className="mt-3 text-[15px] text-[#4b5675] leading-relaxed">{ind.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

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

      <Section>
        <div className="lp-wrap max-w-4xl text-center">
          <motion.div {...fadeUp}>
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">Sector know-how</span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
              <RevealWords text="We learn your rules first" />
            </h2>
            <p className="mt-8 text-[18px] text-[#4b5675] leading-relaxed">
              Every sector has its own requirements, from government ID formats to hospital hygiene and school safety.
              We work through them with you before production starts, so the finished order is right the first time.
            </p>
          </motion.div>
        </div>
      </Section>

      <PageCTA
        title="Don't see your industry?"
        primary={{ to: "/contact", label: "Tell us about it" }}
        secondary={{ to: "/products", label: "Browse products" }}
      >
        If it can be printed, engraved or cut, we can probably make it. Ask us.
      </PageCTA>
    </>
  )
}
