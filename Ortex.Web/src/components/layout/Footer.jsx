import { Link, useLocation } from "react-router-dom"
import RollText from "../ui/RollText"
import { CONTACT } from "../../constants/site"
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
        
        {/* Top: Logo left, tagline on the opposite edge */}
        <div className="lp-footer-top">
          <Link to="/" className="lp-footer-logo" aria-label="Ortex Industries home">
            <img src="/img/logo.svg" alt="Ortex Industries" className="lp-footer-logo-img" />
          </Link>
          <p className="lp-footer-tagline">Manufactured for your brand</p>
        </div>

        {/* Rule divider */}
        <div className="lp-footer-rule" />

        {/* Main: Tagline / Follow on Left, Columns on Right */}
        <div className="lp-footer-main">
          
          <div className="lp-footer-lead">
            <div className="lp-footer-cgroup">
              <h3 className="lp-footer-clabel">Contact us</h3>
              <a className="lp-footer-email" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
              <span className="lp-footer-phones">
                <a href={`tel:${CONTACT.phonePrimary.replace(/[^\d+]/g, "")}`}>{CONTACT.phonePrimary}</a>
                <span aria-hidden="true">·</span>
                <a href={`tel:${CONTACT.phoneSecondary.replace(/[^\d+]/g, "")}`}>{CONTACT.phoneSecondary}</a>
              </span>
            </div>

            <div className="lp-footer-cgroup">
              <h3 className="lp-footer-clabel">Office</h3>
              <p className="lp-footer-cval">New Delhi, India</p>
              <p className="lp-footer-cval">Open Monday to Saturday, 9:00 AM to 6:00 PM</p>
            </div>
          </div>

          <div className="lp-footer-cols">

            {/* Column 1: What we make */}
            <div className="lp-footer-col">
              <h4>What we make</h4>
              <ul>
                <li><Link to="/products"><RollText text="Products & services" /></Link></li>
                <li><Link to="/industries"><RollText text="Industries we serve" /></Link></li>
                <li><Link to="/oem"><RollText text="OEM & white label" /></Link></li>
                <li><Link to="/work"><RollText text="Our work" /></Link></li>
              </ul>
            </div>

            {/* Column 2: Company */}
            <div className="lp-footer-col">
              <h4>Company</h4>
              <ul>
                <li><Link to="/"><RollText text="Home" /></Link></li>
                <li><Link to="/about"><RollText text="About Ortex" /></Link></li>
                <li><Link to="/faq"><RollText text="FAQs" /></Link></li>
                <li><Link to="/contact"><RollText text="Contact us" /></Link></li>
                <li><Link to="/quote"><RollText text="Request a quote" /></Link></li>
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

        {/* Bottom: Copyright & trust badges */}
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
