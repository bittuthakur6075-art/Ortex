import { Link } from "react-router-dom"
import { Globe } from "./Icons"
import "./Hero.css"

// The home hero, in Ortex.Web's style: full-bleed workshop photo under a dark
// scrim, the transparent header over it (Navbar), a word-by-word CSS rise that
// starts at first paint (never a Framer `initial`, which would keep the
// prerendered headline invisible until hydration).
const LINE_1 = ["Customised", "products,"]
const LINE_2 = ["made", "for", "your", "business"]

function Words({ words, offset, accent }) {
  return words.map((word, i) => (
    <span key={word}>
      <span className="lp-word">
        <span className={`lp-word-in${accent ? " acc" : ""}`} style={{ animationDelay: `${0.05 + (offset + i) * 0.07}s` }}>
          {word}
        </span>
      </span>
      {i < words.length - 1 ? " " : ""}
    </span>
  ))
}

export default function Hero() {
  return (
    <section className="lp-hero has-video">
      <img className="lp-hero-video" src="/img/hero-background.avif" alt="" aria-hidden="true" fetchPriority="high" />
      <div className="lp-hero-scrim" aria-hidden="true" />
      <div className="lp-wrap lp-hero-inner">
        <div className="lp-hero-copy lp-reveal">
          <span className="lp-hero-badge">
            <span className="lp-hero-badge-ic"><Globe size={20} color="#fff" /></span>
            Manufactured in Delhi, delivered worldwide
          </span>
          <h1 className="lp-hero-h1">
            <span className="inline-block lg:whitespace-nowrap">
              <Words words={LINE_1} offset={0} />
            </span>
            <br />
            <span className="inline-block lg:whitespace-nowrap">
              <Words words={LINE_2} offset={LINE_1.length} accent />
            </span>
          </h1>
          <p className="lp-hero-sub">
            OEM, white label and fully customised MDF, acrylic, lanyards, badges and corporate gifts, made on our own floor from concept to carton.
          </p>
          <div className="lp-hero-ctas">
            <Link className="lp-pill-btn primary" to="/products">Explore products</Link>
            <Link className="lp-pill-btn outline" to="/contact">Get a quote</Link>
          </div>
        </div>
      </div>
    </section>
  )
}
