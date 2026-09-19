// Icon adapter, the whole admin renders Iconsax "Bulk" icons through this one
// module. Each export keeps the name the code already used (originally lucide),
// so modules just import from here instead of the old icon set. Wrapping every
// icon centralises the variant + colour so the set stays consistent.
//
// Iconsax defaults to a fixed dark fill, so we force `color="currentColor"`
// (inherits text colour) and `variant="Bulk"` unless a caller overrides them.

import {
  Notification as NotificationIcon,
  Warning2,
  ArrowDown2,
  ArrowLeft2,
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
  UserSearch as UserSearchIcon,
  UserTag as UserTagIcon,
  Money,
  InfoCircle,
  Key,
  Category2,
  Element3,
  RowVertical,
  Lock1,
  LogoutCurve,
  Sms,
  Location,
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
  Instagram as InstagramIcon,
  Facebook as FacebookIcon,
  Send2,
  Gallery,
  Calendar1,
  Refresh2,
  CallCalling,
  Headphone,
  Microphone2,
  Play,
  Camera as CameraIcon,
  Mobile,
  Monitor as MonitorIcon,
  Global,
  Copy as CopyIcon,
  More,
  UserTick,
  UserRemove,
  MicrophoneSlash1,
  Minus as MinusIcon,
  ArrowUp as ArrowUpIcon,
} from "iconsax-react"

function wrap(Cmp) {
  return function Icon({ size = 24, color = "currentColor", variant = "Bulk", ...props }) {
    return <Cmp size={size} color={color} variant={variant} {...props} />
  }
}

// lucide name -> Iconsax Bulk equivalent
export const AlertTriangle = wrap(Warning2)
export const ArrowDownLeft = wrap(ArrowDown2)
export const ArrowLeft = wrap(ArrowLeft2)
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
export const UserSearch = wrap(UserSearchIcon)
export const UserTag = wrap(UserTagIcon)
export const IndianRupee = wrap(Money)
export const Info = wrap(InfoCircle)
export const KeyRound = wrap(Key)
export const LayoutDashboard = wrap(Category2)
export const LayoutGrid = wrap(Element3)
export const List = wrap(RowVertical)
export const Lock = wrap(Lock1)
export const LogOut = wrap(LogoutCurve)
export const Mail = wrap(Sms)
export const MapPin = wrap(Location)
export const Menu = wrap(HambergerMenu)
export const Bell = wrap(NotificationIcon)
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
export const Instagram = wrap(InstagramIcon)
export const Facebook = wrap(FacebookIcon)
export const Send = wrap(Send2)
export const ImageIcon = wrap(Gallery)
export const Calendar = wrap(Calendar1)
export const RefreshCw = wrap(Refresh2)
export const PhoneOutgoing = wrap(CallCalling)
export const Headset = wrap(Headphone)
export const Mic = wrap(Microphone2)
export const PlayIcon = wrap(Play)
export const Camera = wrap(CameraIcon)
export const MoreHorizontal = wrap(More)
export const UserCheck = wrap(UserTick)
export const UserX = wrap(UserRemove)
export const MicOff = wrap(MicrophoneSlash1)
export const Minus = wrap(MinusIcon)
export const ArrowUp = wrap(ArrowUpIcon)
export const Smartphone = wrap(Mobile)
export const Monitor = wrap(MonitorIcon)
export const Globe = wrap(Global)
export const Copy = wrap(CopyIcon)

// Iconsax has no LinkedIn mark, so this one is drawn here (Simple Icons path,
// CC0). Same call shape as the wrapped icons: className sizes it, currentColor.
export function LinkedIn({ size = 24, className = "", ...props }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" className={className} {...props}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  )
}

// A spinner (lucide's Loader2 replacement), a CSS ring, so it spins cleanly.
export function Loader2({ className = "" }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden="true" />
}
