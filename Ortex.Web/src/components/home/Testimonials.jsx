import { testimonials } from "../../constants/home"
import { SectionHeading } from "./Section"

export default function Testimonials() {
  return (
    <section className="py-20 bg-secondary overflow-hidden">
      <div className="lp-wrap">
        <SectionHeading eyebrow="Client reviews" title="What procurement teams say">
          Feedback from corporate supply-chain managers, education heads, and promotional buyers on our bulk
          delivery performance.
        </SectionHeading>
      </div>

      <div className="marquee-container-secondary mt-8">
        <div className="animate-marquee-slow py-4 flex gap-6">
          {[...testimonials, ...testimonials].map((t, idx) => (
            <figure
              key={`${t.author}-${idx}`}
              aria-hidden={idx >= testimonials.length}
              className="w-[320px] md:w-[360px] flex-shrink-0 p-6 flex flex-col justify-between text-left bg-card rounded-2xl border border-border/40"
            >
              <blockquote className="text-sm md:text-base text-muted-foreground leading-relaxed italic mb-6">
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
                  <span className="block text-[10px] text-muted-foreground/60">{t.date}</span>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
