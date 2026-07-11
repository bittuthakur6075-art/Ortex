import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Globe } from 'lucide-react'
import './Hero.css'

const BACKGROUND = '/img/hero-background.avif'

export default function Hero() {
  const [reveal, setReveal] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setReveal(true), 150)
    return () => clearTimeout(t)
  }, [])

  return (
    <section className="lp-hero has-video">
      <img className="lp-hero-video" src={BACKGROUND} alt="" aria-hidden="true" fetchPriority="high" />
      <div className="lp-wrap lp-hero-inner">
        <div className={`lp-hero-copy ${reveal ? 'lp-reveal is-in' : 'lp-reveal'}`}>
          <span className="lp-hero-badge">
            <span className="lp-hero-badge-ic"><Globe size={20} color="#fff" /></span>
            Trusted by brands worldwide
          </span>
          <h1 className="lp-hero-h1">
            <span className="inline-block lg:whitespace-nowrap">
              <span className="lp-word"><span className="lp-word-in" style={{ transitionDelay: '0.05s' }}>Premium</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in" style={{ transitionDelay: '0.12s' }}>custom</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in" style={{ transitionDelay: '0.19s' }}>products,</span></span>
            </span>
            <br />
            <span className="inline-block lg:whitespace-nowrap">
              <span className="lp-word"><span className="lp-word-in acc" style={{ transitionDelay: '0.26s' }}>manufactured</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in acc" style={{ transitionDelay: '0.33s' }}>for</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in acc" style={{ transitionDelay: '0.40s' }}>your</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in acc" style={{ transitionDelay: '0.47s' }}>brand</span></span>
            </span>
          </h1>
          <p className="lp-hero-sub">
            Contract manufacturing, OEM &amp; white-label production for MDF, acrylic, lanyards &amp; corporate gifts, delivered across India and worldwide.
          </p>
          <div className="lp-hero-ctas">
            <Link className="lp-pill-btn primary" to="/products">Explore products</Link>
            <Link className="lp-pill-btn outline" to="/quote">Get custom quote</Link>
          </div>
        </div>
      </div>
    </section>
  )
}
