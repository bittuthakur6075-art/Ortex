/**
 * Barrel for the src/ui component kit, ported from the One UI kit in
 * C:\Dev\Mobile App (see that project's src/ui/README.md for the procedure).
 * Import components from here, e.g. `import { Button, Card, useTheme } from "@/ui"`.
 *
 * Every component reads its colours from `useTheme()` and its type from
 * `font.*` — there is no hardcoded colour or `fontWeight` anywhere in the
 * folder (custom fonts do not synthesise weights on Android).
 */

export { default as AppLoader } from "@/ui/AppLoader"
export { default as IconButton } from "@/ui/IconButton"
export { default as PopupMenu, type MenuItem } from "@/ui/PopupMenu"
export { ToastProvider, useToast, type ToastTone } from "@/ui/Toast"
export { default as Icon, type IconName, type IconVariant } from "@/ui/Icon"
export { default as Sheet } from "@/ui/Sheet"
export { Chip, ChipGroup, type ChipOption } from "@/ui/Chips"

export { default as Button, type ButtonVariant, type ButtonSize } from "@/ui/Button"
export { default as TextField } from "@/ui/TextField"
export { default as Card } from "@/ui/Card"
export { default as ListItem } from "@/ui/ListItem"
export { default as Switch } from "@/ui/Switch"
export { default as Checkbox } from "@/ui/Checkbox"
export { default as RadioGroup, type RadioOption } from "@/ui/RadioGroup"
export { default as Badge, type BadgeTone } from "@/ui/Badge"
export { default as StatusBadge } from "@/ui/StatusBadge"
export { default as Avatar, type AvatarSize } from "@/ui/Avatar"
export { default as Divider } from "@/ui/Divider"
export { default as EmptyState } from "@/ui/EmptyState"
export { default as Dialog, type DialogAction } from "@/ui/Dialog"
export { default as Spinner } from "@/ui/Spinner"
export { default as ProgressBar } from "@/ui/ProgressBar"
export { default as SegmentedControl, type SegmentOption } from "@/ui/SegmentedControl"
export { default as Skeleton } from "@/ui/Skeleton"
export { default as SearchField } from "@/ui/SearchField"
export { default as ScreenHeader } from "@/ui/ScreenHeader"
export { default as Fab } from "@/ui/Fab"

export { useTheme, useThemePref, type ThemePref } from "@/store/ThemeContext"
export type { Theme } from "@/theme/theme"
