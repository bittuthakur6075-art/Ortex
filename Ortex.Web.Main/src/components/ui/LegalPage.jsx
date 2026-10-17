import PageHero from "./PageHero"

/** Shared layout for the Privacy and Terms pages: hero, then numbered sections. */
export default function LegalPage({ title, updated, intro, sections }) {
  return (
    <>
      <PageHero title={title}>{intro}</PageHero>
      <section className="pb-[72px] sm:pb-[96px] lg:pb-[140px] bg-background">
        <div className="lp-wrap max-w-3xl">
          <p className="text-[14px] font-semibold uppercase tracking-[0.18em] text-[#78829D]">Last updated {updated}</p>
          <div className="mt-10 flex flex-col gap-10">
            {sections.map((s, i) => (
              <section key={s.title} className="border-t border-border pt-8">
                <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground">
                  {i + 1}. {s.title}
                </h2>
                {s.body.map((para) => (
                  <p key={para.slice(0, 40)} className="mt-4 text-[17px] text-[#4b5675] leading-relaxed">{para}</p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
