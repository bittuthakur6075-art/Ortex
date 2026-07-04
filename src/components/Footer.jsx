import { Link, useLocation } from "react-router-dom"
import RollText from "./RollText"
import logoImg from "../assets/logo.png"
import "./Footer.css"

export default function Footer() {
  const year = new Date().getFullYear()
  const { pathname } = useLocation()
  const onHome = pathname === "/"
  const sec = (id) => (onHome ? `#${id}` : `/#${id}`)

  const TRUST_BADGES = [
    { label: "Quality assured" },
    { label: "Secure orders" },
    { label: "PAN India delivery" },
    { label: "Worldwide export" },
  ]

  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        
        {/* Top: Logo / Brand & Designer link */}
        <div className="lp-footer-top">
          <Link to="/" className="lp-footer-logo flex items-center gap-3" aria-label="Ortex home">
            <img 
              src={logoImg} 
              alt="Ortex Industries Private Limited Logo" 
              className="h-10 md:h-12 w-auto object-contain brightness-0 invert" 
            />
            <span className="lp-footer-logo-text">Ortex Industries</span>
          </Link>
        </div>

        {/* Rule divider */}
        <div className="lp-footer-rule" />

        {/* Main: Tagline / Follow on Left, Columns on Right */}
        <div className="lp-footer-main">
          
          <div className="lp-footer-lead">
            <h2 className="lp-footer-head">
              Where your ideas<br />
              turn into <span className="lp-footer-accent">premium products</span>
            </h2>
            
            <Link to="/products" className="lp-footer-seal-link" aria-label="Quality and manufacturing">
              <span className="lp-footer-seal">
                <svg className="w-5 h-5 flex-shrink-0 bg-white rounded-full p-1 fill-none stroke-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Quality-First Manufacturing
              </span>
            </Link>

            <div className="lp-footer-follow">
              <a
                className="lp-footer-follow-link"
                href="https://wa.me/919211947188?text=Hi%20Ortex%20Industries%2C%20I%20would%20like%20to%20get%20a%20quote%20for%20customized%20products."
                target="_blank"
                rel="noopener noreferrer"
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>

          <div className="lp-footer-cols">
            
            {/* Column 1: Quick links */}
            <div className="lp-footer-col">
              <h4>Quick links</h4>
              <ul>
                <li><Link to="/"><RollText text="Home" /></Link></li>
                <li><Link to="/about"><RollText text="About us" /></Link></li>
                <li><Link to="/products"><RollText text="Products & services" /></Link></li>
                <li><Link to="/industries"><RollText text="Industries we serve" /></Link></li>
                <li><Link to="/portfolio"><RollText text="Portfolio" /></Link></li>
              </ul>
            </div>

            {/* Column 2: Contact */}
            <div className="lp-footer-col">
              <h4>Contact</h4>
              <ul>
                <li>
                  <a href="tel:+919211947188" className="inline-flex items-center gap-1">
                    <RollText text="+91-9211947188" />
                  </a>
                </li>
                <li>
                  <a href="tel:+918448663297" className="inline-flex items-center gap-1">
                    <RollText text="+91-8448663297" />
                  </a>
                </li>
                <li>
                  <a href="mailto:sales@ortexindustries.in" className="inline-flex items-center gap-1">
                    <RollText text="sales@ortexindustries.in" />
                  </a>
                </li>
                <li><Link to="/contact"><RollText text="Contact us" /></Link></li>
                <li><Link to="/quote"><RollText text="Get a quote" /></Link></li>
              </ul>
            </div>

            {/* Column 3: Legal */}
            <div className="lp-footer-col">
              <h4>Legal</h4>
              <ul>
                <li><Link to="/privacy"><RollText text="Privacy policy" /></Link></li>
                <li><Link to="/terms"><RollText text="Terms of service" /></Link></li>
                <li><Link to="/cookies"><RollText text="Cookie policy" /></Link></li>
                <li><Link to="/acceptable-use"><RollText text="Acceptable use" /></Link></li>
              </ul>
            </div>

          </div>
        </div>

        {/* Rule divider */}
        <div className="lp-footer-rule" />

        {/* Bottom: Copyright & Trust badges */}
        <div className="lp-footer-bot">
          <span className="lp-footer-copy">
            Copyright &copy; {year} <span className="lp-footer-co">Ortex Industries</span>. All Rights Reserved.
          </span>
          <div className="lp-footer-trust">
            {TRUST_BADGES.map((b) => (
              <span className="lp-footer-trust-badge" key={b.label}>
                {b.label}
              </span>
            ))}
          </div>
        </div>

      </div>
    </footer>
  )
}
