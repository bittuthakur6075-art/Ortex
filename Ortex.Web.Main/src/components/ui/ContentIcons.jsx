// Maps the `icon` keys in constants/content.js to Iconsax icons, so the content
// file stays plain data. Rendered with variant="Bulk" like Ortex.Web's
// decorative icons; UI controls use components/ui/Icons.jsx.

import {
  Award, Bank, Box, Briefcase, Brush2, Building, Calendar2, ClipboardText, Flag, Flash, Gift,
  Global, Hospital, Layer, Lovely, Medal, Moneys, Personalcard, Profile2User, Shop, Tag, Teacher,
  TickCircle, Element3,
} from "iconsax-react"

const ICONS = {
  // products
  mdf: Element3,
  acrylic: Layer,
  lanyard: Personalcard,
  badge: Medal,
  board: ClipboardText,
  clipboard: Tag,
  gift: Gift,
  brush: Brush2,
  // capabilities
  oem: Award,
  bulk: Box,
  quality: TickCircle,
  pricing: Moneys,
  speed: Flash,
  export: Global,
  // industries
  corporate: Building,
  education: Teacher,
  government: Bank,
  health: Hospital,
  events: Calendar2,
  agency: Profile2User,
  ngo: Lovely,
  campaign: Flag,
  retail: Shop,
  services: Briefcase,
}

export default function ContentIcon({ name, size = 24, className = "" }) {
  const Icon = ICONS[name] || Tag
  return <Icon size={size} variant="Bulk" color="currentColor" className={className} aria-hidden="true" />
}
