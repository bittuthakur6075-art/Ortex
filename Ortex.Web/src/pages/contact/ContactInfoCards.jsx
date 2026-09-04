import { motion } from "framer-motion"
import { Call, Sms, Clock } from "iconsax-react"
import { CONTACT, whatsappLink } from "../../constants/site"
import { fadeUp, RevealWords } from "../../components/ui/Section"
import WhatsAppIcon from "../../components/ui/WhatsAppIcon"
import MapEmbed from "./MapEmbed"
import { telHref } from "./helpers"

/** Renders the shared WhatsApp glyph at the channel-badge size. Accepts (and
 *  ignores) the iconsax-style props so it slots in uniformly with the other
 *  channel icons. */
function WhatsAppMark() {
  return <WhatsAppIcon className="w-6 h-6 fill-current" />
}

const channels = [
  {
    icon: Call,
    title: "Call us",
    details: [
      { label: CONTACT.phonePrimary, href: telHref(CONTACT.phonePrimary) },
      { label: CONTACT.phoneSecondary, href: telHref(CONTACT.phoneSecondary) },
    ],
  },
  {
    icon: Sms,
    title: "Email us",
    details: [{ label: CONTACT.email, href: `mailto:${CONTACT.email}` }],
  },
  {
    icon: WhatsAppMark,
    title: "WhatsApp",
    details: [{ label: CONTACT.phonePrimary, href: whatsappLink() }],
    cta: { label: "Chat on WhatsApp", href: whatsappLink() },
  },
  {
    icon: Clock,
    title: "Business hours",
    details: [
      { label: "Mon to Sat: 9:00 AM to 6:00 PM", href: null },
      { label: "Sunday: Closed", href: null },
    ],
  },
]

/** "Prefer to talk?" column: direct channels (call, email, WhatsApp, hours) and the location map. */
export default function ContactInfoCards() {
  return (
    <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="lg:order-1">
      <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
        Prefer to talk?
      </span>
      <h2 className="text-[36px] md:text-[52px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
        <RevealWords text="Reach us directly" />
      </h2>
      <p className="mt-5 text-[18px] font-normal text-[#4b5675] leading-relaxed">
        Pick whichever is easiest. Every message reaches our team directly, with no call centre in between.
      </p>

      <div className="mt-8 flex flex-col gap-[32px]">
        {channels.map((channel) => (
          <div
            key={channel.title}
            className="flex items-start gap-5"
          >
            <div className="flex-shrink-0 w-[50px] h-[50px] rounded-[999px] bg-primary/10 grid place-items-center text-primary">
              <channel.icon size={24} variant="Bulk" color="currentColor" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold uppercase tracking-[0.02em] text-[#4b5675]">{channel.title}</h3>
              <div className="mt-1 flex flex-wrap gap-x-1.5 text-[18px] font-semibold text-foreground">
                {channel.details.map((detail, i) => (
                  <span key={detail.label} className="min-w-0 break-words [overflow-wrap:anywhere]">
                    {detail.href ? (
                      <a
                        href={detail.href}
                        target={detail.href.startsWith("http") ? "_blank" : undefined}
                        rel={detail.href.startsWith("http") ? "noopener noreferrer" : undefined}
                        className="hover:text-primary transition-colors duration-200"
                      >
                        {detail.label}
                      </a>
                    ) : (
                      detail.label
                    )}
                    {i < channel.details.length - 1 ? "," : ""}
                  </span>
                ))}
              </div>
            </div>

            {channel.cta && (
              <a
                href={channel.cta.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={channel.cta.label}
                title={channel.cta.label}
                className="self-center grid place-items-center flex-shrink-0 w-9 h-9 rounded-full bg-whatsapp text-white transition-all duration-200 hover:brightness-95 active:scale-[0.98]"
              >
                <WhatsAppIcon className="h-[18px] w-[18px] fill-current" />
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Location map */}
      <MapEmbed />
    </motion.div>
  )
}
