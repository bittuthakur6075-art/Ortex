// Turns a login session's user agent into words a person recognises
// ("Chrome on Windows", "Ortex app on Android").
// PORT OF Ortex.Admin/src/lib/sessions.js: edit both (parity test test/sessions.test.mjs).

const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
]

const SYSTEMS: [RegExp, string][] = [
  [/Windows/, "Windows"],
  [/Android/, "Android"],
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Mac OS X|Macintosh/, "Mac"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
]

const pick = (list: [RegExp, string][], ua: string) => list.find(([re]) => re.test(ua))?.[1]

export type DeviceKind = "phone" | "computer"

export function describeDevice(ua: unknown): { label: string; kind: DeviceKind } {
  const s = String(ua || "")
  // The phone app talks to Supabase through the platform's HTTP stack, not a browser.
  if (/okhttp/i.test(s)) return { label: "Ortex app on Android", kind: "phone" }
  if (/CFNetwork|Darwin/.test(s) && !/Mozilla/.test(s)) return { label: "Ortex app on iPhone", kind: "phone" }
  const browser = pick(BROWSERS, s)
  const system = pick(SYSTEMS, s)
  const kind: DeviceKind = /Mobi|Android|iPhone|iPad/.test(s) ? "phone" : "computer"
  if (browser && system) return { label: `${browser} on ${system}`, kind }
  if (browser || system) return { label: (browser || system) as string, kind }
  return { label: "Unknown device", kind: "computer" }
}
