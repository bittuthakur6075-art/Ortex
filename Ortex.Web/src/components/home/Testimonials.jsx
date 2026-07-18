import { testimonials } from "../../constants/home"
import { SectionHeading } from "./Section"

export default function Testimonials() {
  return (
    <section className="section-y bg-[#f9fbfc] overflow-hidden">
      <div className="lp-wrap">
        <SectionHeading eyebrow="Client reviews" title="Buyers who keep coming back">
          What corporate, education, and promotional teams say about ordering from us at volume.
        </SectionHeading>
      </div>

      <div className="marquee-container mt-[30px]">
        <div className="animate-marquee-slow py-4 flex gap-[20px]">
          {[...testimonials, ...testimonials].map((t, idx) => (
            <figure
              key={`${t.author}-${idx}`}
              aria-hidden={idx >= testimonials.length}
              className="w-[320px] md:w-[360px] flex-shrink-0 p-[30px] flex flex-col justify-between text-left bg-card"
            >
              <blockquote className="text-sm md:text-base text-foreground leading-relaxed italic mb-6">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              <figcaption className="pt-4 border-t border-border/40 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">
                  {t.author.split(" ").filter(Boolean).map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <span className="block font-bold text-foreground text-sm truncate">{t.author}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {t.location} • <span className="font-semibold text-primary">{t.product}</span>
                  </span>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
