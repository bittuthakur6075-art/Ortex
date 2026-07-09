// Icon adapter — the whole admin renders Iconsax "Bulk" icons through this one
// module. Each export keeps the name the code already used (originally lucide),
// so modules just import from here instead of the old icon set. Wrapping every
// icon centralises the variant + colour so the set stays consistent.
//
// Iconsax defaults to a fixed dark fill, so we force `color="currentColor"`
// (inherits text colour) and `variant="Bulk"` unless a caller overrides them.

import {
  Warning2,
  ArrowDown2,
  ArrowRight2,
  ArrowRight3,
  ArrowSwapVertical,
  Building3,
  CalendarTick,
  TickCircle,
  Clock as ClockIcon,
  Data,
  DocumentDownload,
  Eye as EyeIcon,
  EyeSlash,
  Convertshape2,
  DocumentText1,
  DocumentText,
  Flash,
  Hashtag,
  DirectInbox,
  Money,
  InfoCircle,
  Key,
  Category2,
  Element3,
  RowVertical,
  Lock1,
  LogoutCurve,
  Sms,
  HambergerMenu,
  Whatsapp,
  Moon as MoonIcon,
  Box1,
  Edit2,
  PercentageSquare,
  Call,
  Add,
  Printer as PrinterIcon,
  Receipt1,
  ReceiptText as ReceiptTextIcon,
  SaveAdd,
  SearchNormal1,
  Setting2,
  ShieldTick,
  MagicStar,
  Star1,
  Sun1,
  Tag2,
  Gps,
  Trash,
  TrendUp,
  Cup,
  DocumentUpload,
  Profile2User,
  Wallet3,
  CloseCircle,
} from "iconsax-react"

function wrap(Cmp) {
  return function Icon({ size = 24, color = "currentColor", variant = "Bulk", ...props }) {
    return <Cmp size={size} color={color} variant={variant} {...props} />
  }
}

// lucide name -> Iconsax Bulk equivalent
export const AlertTriangle = wrap(Warning2)
export const ArrowDownLeft = wrap(ArrowDown2)
export const ArrowRight = wrap(ArrowRight2)
export const ArrowUpRight = wrap(ArrowRight3)
export const ArrowUpDown = wrap(ArrowSwapVertical)
export const Building2 = wrap(Building3)
export const CalendarClock = wrap(CalendarTick)
export const CheckCircle2 = wrap(TickCircle)
export const Clock = wrap(ClockIcon)
export const Database = wrap(Data)
export const Download = wrap(DocumentDownload)
export const Eye = wrap(EyeIcon)
export const EyeOff = wrap(EyeSlash)
export const FileCheck2 = wrap(Convertshape2)
export const FileSpreadsheet = wrap(DocumentText1)
export const FileText = wrap(DocumentText)
export const Flame = wrap(Flash)
export const Hash = wrap(Hashtag)
export const Inbox = wrap(DirectInbox)
export const IndianRupee = wrap(Money)
export const Info = wrap(InfoCircle)
export const KeyRound = wrap(Key)
export const LayoutDashboard = wrap(Category2)
export const LayoutGrid = wrap(Element3)
export const List = wrap(RowVertical)
export const Lock = wrap(Lock1)
export const LogOut = wrap(LogoutCurve)
export const Mail = wrap(Sms)
export const Menu = wrap(HambergerMenu)
export const MessageCircle = wrap(Whatsapp)
export const Moon = wrap(MoonIcon)
export const Package = wrap(Box1)
export const Pencil = wrap(Edit2)
export const Percent = wrap(PercentageSquare)
export const Phone = wrap(Call)
export const Plus = wrap(Add)
export const Printer = wrap(PrinterIcon)
export const ReceiptIndianRupee = wrap(Receipt1)
export const ReceiptText = wrap(ReceiptTextIcon)
export const Save = wrap(SaveAdd)
export const Search = wrap(SearchNormal1)
export const Settings = wrap(Setting2)
export const ShieldCheck = wrap(ShieldTick)
export const Sparkles = wrap(MagicStar)
export const Star = wrap(Star1)
export const Sun = wrap(Sun1)
export const Tags = wrap(Tag2)
export const Target = wrap(Gps)
export const Trash2 = wrap(Trash)
export const TrendingUp = wrap(TrendUp)
export const Trophy = wrap(Cup)
export const Upload = wrap(DocumentUpload)
export const Users = wrap(Profile2User)
export const Wallet = wrap(Wallet3)
export const X = wrap(CloseCircle)

// A spinner (lucide's Loader2 replacement) — a CSS ring, so it spins cleanly.
export function Loader2({ className = "" }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden="true" />
}
