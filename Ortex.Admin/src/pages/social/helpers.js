import { Instagram, Facebook } from "../../components/ui/Icons"

export const PLATFORM_ICON = { instagram: Instagram, facebook: Facebook }

/** ISO string → the `YYYY-MM-DDTHH:mm` a datetime-local input expects, in local time. */
export function toLocalInput(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
