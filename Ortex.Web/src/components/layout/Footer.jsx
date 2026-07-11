import { Link, useLocation } from "react-router-dom"
import RollText from "../ui/RollText"
import { CONTACT, whatsappLink } from "../../constants/site"
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
          <Link to="/" className="lp-footer-logo" aria-label="Ortex Industries home">
            <img src="/img/logo.svg" alt="Ortex Industries" className="lp-footer-logo-img" />
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

            <p className="lp-footer-blurb">
              In-house manufacturing of custom MDF, acrylic, lanyards, badges, and corporate gifts, delivered
              across India and worldwide.
            </p>

            <div className="lp-footer-actions">
              <Link to="/products" className="lp-footer-seal-link" aria-label="Quality and manufacturing">
                <span className="lp-footer-seal">
                  <svg className="w-5 h-5 flex-shrink-0 bg-white rounded-full p-1 fill-none stroke-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Quality-First Manufacturing
                </span>
              </Link>

              <a
                className="lp-footer-whatsapp"
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
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
                <li><Link to="/products"><RollText text="Products & services" /></Link></li>
                <li><Link to="/industries"><RollText text="Industries we serve" /></Link></li>
                <li><Link to="/oem"><RollText text="OEM & white label" /></Link></li>
                <li><Link to="/work"><RollText text="Our work" /></Link></li>
                <li><Link to="/gallery"><RollText text="Photo gallery" /></Link></li>
                <li><Link to="/faq"><RollText text="FAQs" /></Link></li>
                <li><Link to="/about"><RollText text="About us" /></Link></li>
              </ul>
            </div>

            {/* Column 2: Contact */}
            <div className="lp-footer-col">
              <h4>Contact</h4>
              <ul>
                <li>
                  <a href={`tel:${CONTACT.phonePrimary.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1">
                    <RollText text={CONTACT.phonePrimary} />
                  </a>
                </li>
                <li>
                  <a href={`tel:${CONTACT.phoneSecondary.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1">
                    <RollText text={CONTACT.phoneSecondary} />
                  </a>
                </li>
                <li>
                  <a href={`mailto:${CONTACT.email}`} className="inline-flex items-center gap-1">
                    <RollText text={CONTACT.email} />
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
