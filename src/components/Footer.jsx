import { Link } from "react-router-dom"
import { Phone, Mail, Globe } from "lucide-react"

export default function Footer() {
  const currentYear = new Date().getFullYear()

  const quickLinks = [
    { name: "Home", path: "/" },
    { name: "About us", path: "/about" },
    { name: "Products & services", path: "/products" },
    { name: "Industries we serve", path: "/industries" },
    { name: "Contact us", path: "/contact" }
  ]

  return (
    <footer className="bg-secondary text-secondary-foreground border-t">
      <div className="lp-wrap py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 text-left">
          
          {/* Brand section */}
          <div>
            <span className="text-xl font-bold text-primary">Ortex Industries</span>
            <p className="mt-4 text-sm leading-relaxed max-w-prose text-muted-foreground">
              Transforming ideas into premium customized products for businesses worldwide. Your trusted partner for manufacturing excellence.
            </p>
          </div>

          {/* Quick links */}
          <div>
            <span className="text-sm font-semibold uppercase tracking-wider text-foreground">Quick links</span>
            <ul className="mt-4 space-y-2">
              {quickLinks.map((link) => (
                <li key={link.path}>
                  <Link to={link.path} className="text-sm text-muted-foreground hover:text-primary transition-all duration-200">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact information */}
          <div>
            <span className="text-sm font-semibold uppercase tracking-wider text-foreground">Contact information</span>
            <ul className="mt-4 space-y-3">
              <li className="flex items-start space-x-2">
                <Phone className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <div className="text-sm text-muted-foreground">
                  <a href="tel:+919211947188" className="hover:text-primary transition-all duration-200">
                    +91-9211947188
                  </a>
                  <br />
                  <a href="tel:+918448663297" className="hover:text-primary transition-all duration-200">
                    +91-8448663297
                  </a>
                </div>
              </li>
              <li className="flex items-start space-x-2">
                <Mail className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <a href="mailto:sales@ortexindustries.in" className="text-sm text-muted-foreground hover:text-primary transition-all duration-200">
                  sales@ortexindustries.in
                </a>
              </li>
              <li className="flex items-start space-x-2">
                {/* Custom HSL-colored WhatsApp logo */}
                <svg className="h-4 w-4 mt-0.5 flex-shrink-0 text-whatsapp fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.62.962 3.21 1.468 4.797 1.469 5.378-.001 9.756-4.379 9.759-9.76.002-2.607-1.013-5.059-2.859-6.907C16.438 2.11 13.99 1.096 11.385 1.096 6.006 1.096 1.628 5.474 1.625 10.855c-.001 1.639.489 3.238 1.419 4.7l-.986 3.603 3.699-.97c1.472.842 2.87 1.34 4.545 1.34zM17.476 14.39c-.329-.165-1.948-.96-2.253-1.071-.305-.11-.527-.165-.749.165-.221.329-.857 1.071-1.05 1.29-.193.22-.387.247-.716.082-1.099-.548-1.867-1.026-2.607-2.296-.195-.334-.195-.568-.03-.733.149-.148.329-.384.494-.576.165-.192.22-.329.329-.548.11-.22.055-.412-.028-.577-.082-.165-.749-1.808-1.026-2.476-.27-.648-.544-.56-.749-.57-.193-.01-.415-.011-.637-.011-.222 0-.582.083-.887.412-.305.329-1.164 1.14-1.164 2.784 0 1.644 1.196 3.23 1.361 3.45.165.22 2.353 3.593 5.7 5.039.796.344 1.417.55 1.902.705.8.254 1.528.218 2.103.133.64-.095 1.948-.796 2.223-1.564.276-.768.276-1.426.192-1.563-.083-.138-.305-.22-.634-.385z" />
                </svg>
                <a href="https://wa.me/919211947188" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-all duration-200">
                  WhatsApp: +91-9211947188
                </a>
              </li>
            </ul>
          </div>

          {/* Service Areas */}
          <div>
            <span className="text-sm font-semibold uppercase tracking-wider text-foreground">Service areas</span>
            <ul className="mt-4 space-y-2">
              <li className="flex items-start space-x-2">
                <Globe className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <span className="text-sm text-muted-foreground">PAN India delivery</span>
              </li>
              <li className="flex items-start space-x-2">
                <Globe className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <span className="text-sm text-muted-foreground">Worldwide export support</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Footer Bottom */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0 text-muted-foreground">
          <p className="text-sm">
            &copy; {currentYear} Ortex Industries. All rights reserved.
          </p>
          <div className="flex space-x-6">
            <Link to="/privacy" className="text-sm hover:text-primary transition-all duration-200">
              Privacy policy
            </Link>
            <Link to="/terms" className="text-sm hover:text-primary transition-all duration-200">
              Terms of service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
