import ParticlePandit from "../components/ParticlePandit"
import { poojas } from "../data/poojas"

const HOW = [
  { title: "Choose your pooja", text: "Read the complete vidhi, the samagri list and the katha before the day, and tick off what you have." },
  { title: "Set up your altar", text: "Keep the laptop where its camera sees the chowki, kalash and diya, and join the video call." },
  { title: "Pandit Ji guides you", text: "He sees the altar, explains each step and recites every mantra phrase by phrase for you to repeat." },
  { title: "Ask him anything", text: "Stop him at any moment with any question, in Maithili, Hindi or English. He answers, then carries on." },
]

export default function Home() {
  return (
    <>
      <section className="bg-call text-white">
        <div className="lp-wrap grid items-center gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div className="hero-in">
            <p className="deva text-[18px] text-amber-300">श्री गणेशाय नमः</p>
            <h1 className="mt-4 text-[38px] font-medium leading-[1.05] tracking-tight sm:text-[52px] lg:text-[64px]">
              A learned Pandit Ji for every pooja, <span className="font-serif italic text-amber-200">at home.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/75">
              Do your pooja properly, in the Maithil Brahmin paddhati. Pandit Ji joins you on a video call, watches your altar through the
              camera, guides every step with warmth, and recites the correct mantras and the full katha with you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#/pooja/satyanarayan/live" className="btn btn-primary btn-lg">Start Satyanarayan Pooja</a>
              <a href="#/pooja/satyanarayan" className="btn btn-lg border-white/30 text-white hover:bg-white/10">Read the vidhi first</a>
            </div>
          </div>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/10 bg-call-tile">
            <ParticlePandit className="absolute inset-0" />
            <p className="absolute bottom-4 left-4 rounded-full bg-black/50 px-3 py-1.5 text-sm backdrop-blur">
              <span className="font-semibold">Pandit Ji</span> <span className="text-white/60">· move your cursor over him</span>
            </p>
          </div>
        </div>
      </section>

      <section className="section-y">
        <div className="lp-wrap">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">How it works</p>
          <h2 className="mt-3 max-w-3xl text-[30px] font-medium leading-[1.08] tracking-tight sm:text-[40px] md:text-[48px]">
            Like your family purohit, <span className="font-serif italic text-primary">on a video call.</span>
          </h2>
          <ol className="mt-14 grid list-none grid-cols-1 gap-[42px] sm:grid-cols-2 lg:grid-cols-4">
            {HOW.map((h, i) => (
              <li key={h.title}>
                <div className="mb-8 text-[36px] font-semibold leading-none tabular-nums text-primary/50">0{i + 1}</div>
                <h3 className="text-[20px] font-medium md:text-[24px]">{h.title}</h3>
                <div className="mt-6 border-t border-primary/40" />
                <p className="mt-6 text-[16px] leading-relaxed text-foreground/80">{h.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t bg-secondary section-y">
        <div className="lp-wrap">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-[30px] font-medium leading-[1.08] tracking-tight sm:text-[40px]">Poojas</h2>
            <p className="max-w-md text-[15px] text-muted-foreground">More poojas are being prepared in the Maithil paddhati.</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {poojas.map((p) => {
              const body = (
                <>
                  <p className="deva text-[20px] text-primary">{p.nameHi}</p>
                  <h3 className="mt-1 text-[20px] font-medium">{p.name}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{p.summary}</p>
                  <p className={`mt-6 text-sm font-semibold ${p.available ? "text-primary" : "text-muted-foreground"}`}>
                    {p.available ? "Open the pooja →" : "Coming soon"}
                  </p>
                </>
              )
              return p.available ? (
                <a key={p.id} href={`#/pooja/${p.id}`} className="rounded-2xl border bg-card p-6 transition-colors hover:border-primary">
                  {body}
                </a>
              ) : (
                <div key={p.id} className="rounded-2xl border bg-card/60 p-6 opacity-70">{body}</div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="section-y">
        <div className="lp-wrap grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">Exact mantras</p>
            <h2 className="mt-3 text-[30px] font-medium leading-[1.08] tracking-tight sm:text-[40px]">
              Every mantra is written out, <span className="font-serif italic text-primary">word by word.</span>
            </h2>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-foreground/80">
              Pandit Ji recites from the text on this site, never from memory, so the AI cannot make a mantra up. Each one comes with its
              transliteration and its meaning.
            </p>
          </div>
          <div className="rounded-2xl border border-primary/25 bg-secondary p-6">
            <p className="deva text-[22px] leading-relaxed sm:text-[26px]">
              ॐ अपवित्रः पवित्रो वा सर्वावस्थां गतोऽपि वा।
              <br />
              यः स्मरेत् पुण्डरीकाक्षं स बाह्याभ्यन्तरः शुचिः॥
            </p>
            <p className="mt-4 text-[14px] italic text-muted-foreground">Om apavitrah pavitro va sarvavastham gato'pi va, yah smaret pundarikaksham sa bahyabhyantarah shuchih.</p>
          </div>
        </div>
      </section>
    </>
  )
}
