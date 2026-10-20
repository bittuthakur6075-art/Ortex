import { Link } from 'react-router-dom'
import { Globe } from "./Icons"
import { STATS, TERMS } from "../../constants/business"
import './Hero.css'

const BACKGROUND = '/img/hero-background.avif'

export default function Hero() {
  return (
    <section className="lp-hero has-video">
      <img className="lp-hero-video" src={BACKGROUND} alt="" aria-hidden="true" fetchPriority="high" />
      {/* Darkening overlay so the white logo/nav/headline stay legible over the
          vivid laser-engraving photo. */}
      <div className="lp-hero-scrim" aria-hidden="true" />
      <div className="lp-wrap lp-hero-inner">
        <div className="lp-hero-copy lp-reveal">
          <span className="lp-hero-badge">
            <span className="lp-hero-badge-ic"><Globe size={20} color="#fff" /></span>
            Trusted by {STATS.find((s) => s.label.startsWith("Brands")).value} brands
          </span>
          <h1 className="lp-hero-h1">
            <span className="inline-block lg:whitespace-nowrap">
              {/* The H1 names what Ortex makes and where: the page's strongest
                  keyword signal after the title. */}
              <span className="lp-word"><span className="lp-word-in" style={{ animationDelay: '0.05s' }}>Custom</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in" style={{ animationDelay: '0.12s' }}>lanyards,</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in" style={{ animationDelay: '0.19s' }}>badges</span></span>
            </span>
            {/* The space keeps the heading's text "badges & corporate", not "badges&", for crawlers. */}
            {' '}
            <br />
            <span className="inline-block lg:whitespace-nowrap">
              <span className="lp-word"><span className="lp-word-in acc" style={{ animationDelay: '0.26s' }}>&amp;</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in acc" style={{ animationDelay: '0.30s' }}>corporate</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in acc" style={{ animationDelay: '0.37s' }}>gifts,</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in acc" style={{ animationDelay: '0.44s' }}>made</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in acc" style={{ animationDelay: '0.51s' }}>in</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in acc" style={{ animationDelay: '0.58s' }}>Delhi</span></span>
            </span>
          </h1>
          <p className="lp-hero-sub">
            Contract manufacturing, OEM &amp; white-label production for MDF, acrylic, lanyards &amp; corporate gifts, delivered across India and worldwide.
          </p>
          <div className="lp-hero-ctas">
            {/* The quote is the action the page exists for, so it leads. */}
            <Link className="lp-pill-btn primary" to="/quote">Get a free quote</Link>
            <Link className="lp-pill-btn outline" to="/products">Explore products</Link>
          </div>
          <p className="lp-hero-note">
            Free digital mockup · GST invoice · Quote within {TERMS.quoteTurnaround}
          </p>
        </div>
      </div>
    </section>
  )
}
