import { Link } from "react-router-dom"
import RollText from "../ui/RollText"
import WhatsAppIcon from "../ui/WhatsAppIcon"
import { CONTACT, ADDRESS_LINE, CATALOGUE_URL, telHref, whatsappLink } from "../../constants/site"
import { PRODUCTS } from "../../constants/content"
import "./Footer.css"

const TRUST_BADGES = ["Made in-house", "GST invoicing", "PAN India delivery", "Worldwide export"]

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="lp-footer-top">
          <Link to="/" className="lp-footer-logo" aria-label="Ortex Industries home">
            <img src="/img/logo.svg" alt="Ortex Industries" className="lp-footer-logo-img" />
          </Link>
          <p className="lp-footer-tagline">Manufactured for your brand</p>
        </div>

        <div className="lp-footer-rule" />

        <div className="lp-footer-main">
          <div className="lp-footer-lead">
            <div className="lp-footer-cgroup">
              <p className="lp-footer-clabel">Contact us</p>
              <a className="lp-footer-email" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
              <span className="lp-footer-phones">
                <a href={telHref(CONTACT.phonePrimary)}>{CONTACT.phonePrimary}</a>
                <span aria-hidden="true">·</span>
                <a href={telHref(CONTACT.phoneSecondary)}>{CONTACT.phoneSecondary}</a>
              </span>
              <address className="lp-footer-address not-italic">{ADDRESS_LINE}</address>
            </div>

            <div className="lp-footer-cgroup lp-footer-cgroup--row">
              <p className="lp-footer-clabel">Chat with us</p>
              <a className="lp-footer-whatsapp" href={whatsappLink()} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon className="lp-footer-whatsapp-icon" />
                <span>Message us on WhatsApp</span>
              </a>
            </div>
          </div>

          <div className="lp-footer-cols">
            <div className="lp-footer-col">
              <p className="lp-footer-colhead">Products</p>
              <ul>
                {PRODUCTS.map((p) => (
                  <li key={p.slug}><Link to={`/products#${p.slug}`}><RollText text={p.short || p.title} /></Link></li>
                ))}
              </ul>
            </div>

            <div className="lp-footer-col">
              <p className="lp-footer-colhead">Company</p>
              <ul>
                <li><Link to="/"><RollText text="Home" /></Link></li>
                <li><Link to="/about"><RollText text="About us" /></Link></li>
                <li><Link to="/industries"><RollText text="Industries we serve" /></Link></li>
                <li><Link to="/portfolio"><RollText text="Portfolio" /></Link></li>
                <li><Link to="/contact"><RollText text="Contact us" /></Link></li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <p className="lp-footer-colhead">More from Ortex</p>
              <ul>
                <li><a href={CATALOGUE_URL}><RollText text="Product catalogue" /></a></li>
                <li><a href={`${CATALOGUE_URL}/quote`}><RollText text="Build a quote" /></a></li>
                <li><a href={`${CATALOGUE_URL}/faq`}><RollText text="FAQs" /></a></li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <p className="lp-footer-colhead">Legal</p>
              <ul>
                <li><Link to="/privacy"><RollText text="Privacy policy" /></Link></li>
                <li><Link to="/terms"><RollText text="Terms of service" /></Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="lp-footer-rule" />

        <div className="lp-footer-bot">
          <span className="lp-footer-copy">
            Copyright &copy; {year} <span className="lp-footer-co">Ortex Industries Private Limited</span>. All rights reserved.
          </span>
          <div className="lp-footer-trust">
            {TRUST_BADGES.map((label) => (
              <span className="lp-footer-trust-badge" key={label}>{label}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
