import React from "react"

// Deep imports (not the barrel `iconsax-react-native`) — the barrel re-exports all
// 995 icons and Metro cannot tree-shake it, which added ~4 MB to the bundle.
import Add from "iconsax-react-native/dist/esm/Add"
import Additem from "iconsax-react-native/dist/esm/Additem"
import ArrowDown2 from "iconsax-react-native/dist/esm/ArrowDown2"
import ArrowLeft from "iconsax-react-native/dist/esm/ArrowLeft"
import ArrowLeft2 from "iconsax-react-native/dist/esm/ArrowLeft2"
import ArrowRight2 from "iconsax-react-native/dist/esm/ArrowRight2"
import Box from "iconsax-react-native/dist/esm/Box"
import Buildings2 from "iconsax-react-native/dist/esm/Buildings2"
import Calendar from "iconsax-react-native/dist/esm/Calendar"
import Camera from "iconsax-react-native/dist/esm/Camera"
import Call from "iconsax-react-native/dist/esm/Call"
import Category from "iconsax-react-native/dist/esm/Category"
import Clock from "iconsax-react-native/dist/esm/Clock"
import CloseCircle from "iconsax-react-native/dist/esm/CloseCircle"
import Copy from "iconsax-react-native/dist/esm/Copy"
import Danger from "iconsax-react-native/dist/esm/Danger"
import DirectInbox from "iconsax-react-native/dist/esm/DirectInbox"
import DiscountShape from "iconsax-react-native/dist/esm/DiscountShape"
import DocumentText from "iconsax-react-native/dist/esm/DocumentText"
import Edit2 from "iconsax-react-native/dist/esm/Edit2"
import Export from "iconsax-react-native/dist/esm/Export"
import Eye from "iconsax-react-native/dist/esm/Eye"
import EyeSlash from "iconsax-react-native/dist/esm/EyeSlash"
import Filter from "iconsax-react-native/dist/esm/Filter"
import FingerScan from "iconsax-react-native/dist/esm/FingerScan"
import Gallery from "iconsax-react-native/dist/esm/Gallery"
import InfoCircle from "iconsax-react-native/dist/esm/InfoCircle"
import Location from "iconsax-react-native/dist/esm/Location"
import Lock from "iconsax-react-native/dist/esm/Lock"
import Logout from "iconsax-react-native/dist/esm/Logout"
import Microphone2 from "iconsax-react-native/dist/esm/Microphone2"
import Minus from "iconsax-react-native/dist/esm/Minus"
import Money from "iconsax-react-native/dist/esm/Money"
import Moon from "iconsax-react-native/dist/esm/Moon"
import More from "iconsax-react-native/dist/esm/More"
import PercentageSquare from "iconsax-react-native/dist/esm/PercentageSquare"
import Personalcard from "iconsax-react-native/dist/esm/Personalcard"
import Printer from "iconsax-react-native/dist/esm/Printer"
import Profile2User from "iconsax-react-native/dist/esm/Profile2User"
import ProfileCircle from "iconsax-react-native/dist/esm/ProfileCircle"
import Receipt21 from "iconsax-react-native/dist/esm/Receipt21"
import Refresh from "iconsax-react-native/dist/esm/Refresh"
import SearchNormal1 from "iconsax-react-native/dist/esm/SearchNormal1"
import Send from "iconsax-react-native/dist/esm/Send"
import Setting2 from "iconsax-react-native/dist/esm/Setting2"
import Sms from "iconsax-react-native/dist/esm/Sms"
import Sort from "iconsax-react-native/dist/esm/Sort"
import Star1 from "iconsax-react-native/dist/esm/Star1"
import TickCircle from "iconsax-react-native/dist/esm/TickCircle"
import Trash from "iconsax-react-native/dist/esm/Trash"
import Whatsapp from "iconsax-react-native/dist/esm/Whatsapp"

import { useTheme } from "@/store/ThemeContext"

/** Iconsax variants: Linear (idle) and Bold (active/filled). */
export type IconVariant = "Linear" | "Outline" | "Bold" | "Bulk" | "Broken" | "TwoTone"

const GLYPHS = {
  // navigation & chrome
  // Capnix's app bar uses the ARROW, not a chevron: at 24 a chevron reads as a
  // list affordance rather than "leave this screen".
  back: ArrowLeft,
  backChevron: ArrowLeft2,
  forward: ArrowRight2,
  down: ArrowDown2,
  more: More,
  search: SearchNormal1,
  filter: Filter,
  sort: Sort,
  close: CloseCircle,
  add: Add,
  minus: Minus,
  addItem: Additem,
  tick: TickCircle,
  edit: Edit2,
  trash: Trash,
  refresh: Refresh,
  settings: Setting2,
  copy: Copy,
  share: Export,
  print: Printer,
  preview: Eye,
  hidden: EyeSlash,
  send: Send,
  // business objects — one per tab, plus the record types behind them
  quote: DocumentText,
  invoice: Receipt21,
  product: Box,
  catalogue: Category,
  customer: Profile2User,
  company: Buildings2,
  enquiry: Sms,
  // The Leads tab, which is enquiries AND voice calls: what came IN, not mail.
  leads: DirectInbox,
  voice: Microphone2,
  gst: Personalcard,
  money: Money,
  discount: DiscountShape,
  percent: PercentageSquare,
  // contact actions
  call: Call,
  whatsapp: Whatsapp,
  mail: Sms,
  address: Location,
  // state
  star: Star1,
  clock: Clock,
  calendar: Calendar,
  warning: Danger,
  info: InfoCircle,
  image: Gallery,
  camera: Camera,
  theme: Moon,
  // account
  profile: ProfileCircle,
  lock: Lock,
  fingerprint: FingerScan,
  logout: Logout,
} as const

export type IconName = keyof typeof GLYPHS

type Props = {
  name: IconName
  size?: number
  color?: string
  variant?: IconVariant
}

export default function Icon({ name, size = 22, color, variant = "Linear" }: Props) {
  const t = useTheme()
  const Glyph = GLYPHS[name]
  return <Glyph size={size} color={color ?? t.text} variant={variant} />
}
