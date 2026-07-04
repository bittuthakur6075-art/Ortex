import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  Globe, 
  ArrowRight, 
  LayoutGrid, 
  ShieldCheck, 
  Package, 
  BarChart3, 
  Truck, 
  TrendingUp, 
  FileText, 
  RefreshCw, 
  Sparkles, 
  Plus, 
  AlertCircle, 
  Users, 
  Check 
} from 'lucide-react'
import './Hero.css'

export default function Hero() {
  const [reveal, setReveal] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setReveal(true), 150)
    return () => clearTimeout(t)
  }, [])

  return (
    <section className="lp-hero">
      <div className="lp-hero-mesh" aria-hidden="true">
        <span className="lp-mesh-glow" />
      </div>
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
