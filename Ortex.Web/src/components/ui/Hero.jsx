import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Globe } from 'lucide-react'
import './Hero.css'

const POSTER = '/img/factory-production-workshop.jpg'

/**
 * The hero video is a large download. Only fetch it for visitors who can
 * absorb it: on a wide viewport, off Data Saver, not on a metered/slow
 * connection, and not asking for reduced motion. Everyone else gets the poster
 * image, which is what the first frame shows anyway.
 */
function shouldLoadVideo() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (window.innerWidth < 768) return false

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  if (connection) {
    if (connection.saveData) return false
    if (/^(slow-2g|2g|3g)$/.test(connection.effectiveType || '')) return false
  }
  return true
}

export default function Hero() {
  const [reveal, setReveal] = useState(false)
  const [showVideo, setShowVideo] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setReveal(true), 150)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    // Deferred to an idle callback so the video never competes with LCP.
    if (!shouldLoadVideo()) return
    const schedule = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200))
    const handle = schedule(() => setShowVideo(true))
    return () => (window.cancelIdleCallback || clearTimeout)(handle)
  }, [])

  return (
    <section className="lp-hero has-video">
      <img className="lp-hero-video" src={POSTER} alt="" aria-hidden="true" fetchPriority="high" />
      {showVideo && (
        <video
          className="lp-hero-video"
          src="/hero-bg.mp4"
          poster={POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
        />
      )}
      <div className="lp-hero-overlay" />
      <div className="lp-wrap lp-hero-inner">
        <div className={`lp-hero-copy ${reveal ? 'lp-reveal is-in' : 'lp-reveal'}`}>
          <span className="lp-hero-badge">
            <span className="lp-hero-badge-ic"><Globe size={20} color="#fff" /></span>
            Made for businesses worldwide
          </span>
          <h1 className="lp-hero-h1">
            <span className="inline-block lg:whitespace-nowrap">
              <span className="lp-word"><span className="lp-word-in" style={{ transitionDelay: '0.05s' }}>Your</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in" style={{ transitionDelay: '0.12s' }}>trusted</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in" style={{ transitionDelay: '0.19s' }}>global</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in" style={{ transitionDelay: '0.26s' }}>partner</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in" style={{ transitionDelay: '0.33s' }}>for</span></span>
            </span>
            <br />
            <span className="inline-block">
              <span className="lp-word"><span className="lp-word-in acc" style={{ transitionDelay: '0.40s' }}>Customized</span></span>{' '}
              <span className="lp-word"><span className="lp-word-in acc" style={{ transitionDelay: '0.47s' }}>Products</span></span>
            </span>
          </h1>
          <p className="lp-hero-sub">
            Ortex Industries specializes in contract manufacturing, OEM production, and white-label solutions for premium MDF products, acrylic items, custom lanyards, and corporate gifts. Delivered PAN India and exported worldwide with absolute quality control.
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
