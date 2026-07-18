import { featuredIndustries } from "../../constants/home"

/**
 * Otto "We service your vehicle" banner style: a full-width deep-indigo band
 * with a large heading on the left and a short two-line supporting line on the
 * right. The industries marquee sits below, recoloured for the dark band.
 *
 * Seamless infinite scroll: the strip is one "half" wide enough to overfill any
 * viewport (the base list repeated), rendered twice. The keyframe translates
 * exactly -50%, so it wraps with no visible start, end, or gap.
 */
const HALF = Array.from({ length: 3 }, () => featuredIndustries).flat()

export default function IndustriesPreview() {
  return (
    <section className="bg-[#2f50e4] text-white section-y-cta overflow-hidden">
      {/* Banner header: heading left, supporting copy right */}
      <div className="lp-wrap flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-[36px] md:text-[52px] font-normal leading-[1.05] tracking-tight text-white max-w-2xl">
          Built for your industry
        </h2>
        <p className="text-[15px] md:text-[16px] leading-relaxed text-white/75 max-w-xs lg:text-right">
          Every sector buys differently. We build to the standards yours works to.
        </p>
      </div>

      {/* Industries marquee */}
      <div className="relative overflow-hidden py-4 mt-8">
        <div className="animate-marquee flex w-max">
          {[...HALF, ...HALF].map((item, idx) => (
            <div
              key={`${item.title}-${idx}`}
              aria-hidden={idx >= featuredIndustries.length}
              className="flex-shrink-0 flex items-center rounded-full bg-white/[0.06] px-7 py-[10px] mr-[10px]"
            >
              <h3 className="text-[18px] font-semibold text-white">{item.title}</h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
