// Icon adapter — the site renders Iconsax icons only (the same set the Admin
// console uses). These exports keep the lucide names the pages already used so
// the swap was a one-line import change, and centralise the default variant.
//
// Iconsax defaults to a fixed dark fill, so we force `color="currentColor"`
// (inherits text colour). UI controls (arrows, close, check, chevrons) default
// to the "Linear" outline variant, which matches the stroke look lucide had;
// decorative icons elsewhere in the site pass variant="Bulk" explicitly.

import {
  Add,
  ArrowDown2,
  ArrowLeft2,
  ArrowRight as ArrowRightIcon,
  CloseCircle,
  Global,
  HambergerMenu,
  Home2,
  Minus as MinusIcon,
  SearchNormal1,
  TickCircle,
  Warning2,
} from "iconsax-react"

function wrap(Cmp) {
  // `strokeWidth` was a lucide-only prop; drop it so it never reaches the SVG.
  // eslint-disable-next-line no-unused-vars
  return function Icon({ size = 24, color = "currentColor", variant = "Linear", strokeWidth: _sw, ...props }) {
    return <Cmp size={size} color={color} variant={variant} {...props} />
  }
}

// lucide name -> Iconsax equivalent
export const AlertTriangle = wrap(Warning2)
export const ArrowRight = wrap(ArrowRightIcon)
export const Check = wrap(TickCircle)
export const ChevronDown = wrap(ArrowDown2)
export const ChevronLeft = wrap(ArrowLeft2)
export const Globe = wrap(Global)
export const Home = wrap(Home2)
export const Menu = wrap(HambergerMenu)
export const Minus = wrap(MinusIcon)
export const Plus = wrap(Add)
export const Search = wrap(SearchNormal1)
export const X = wrap(CloseCircle)
