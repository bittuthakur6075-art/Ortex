import type { IconName } from "@/ui/Icon"

/**
 * Delhi's weather for the Home greeting, from Open-Meteo (free, no key). A fixed
 * city on purpose: the app asks for no location permission (owner, 2026-09-27).
 */

export type Weather = { temp: number; high: number; low: number; label: string; icon: IconName; day: boolean }

const URL =
  "https://api.open-meteo.com/v1/forecast?latitude=28.6139&longitude=77.209" +
  "&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min" +
  "&timezone=Asia%2FKolkata&forecast_days=1"
const FRESH_MS = 30 * 60000

let cached: { at: number; w: Weather } | null = null

/** WMO weather code → One UI's words and glyph. */
export function describe(code: number, day: boolean): { label: string; icon: IconName } {
  if (code === 0) return { label: "Clear", icon: day ? "sun" : "moon" }
  if (code <= 2) return { label: "Partly cloudy", icon: day ? "cloudSun" : "cloud" }
  if (code === 3) return { label: "Cloudy", icon: "cloud" }
  if (code === 45 || code === 48) return { label: "Haze", icon: "fog" }
  if (code >= 95) return { label: "Thunderstorm", icon: "storm" }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Snow", icon: "snow" }
  if (code >= 51 && code <= 57) return { label: "Drizzle", icon: "rain" }
  return { label: "Rain", icon: "rain" }
}

/** Null when offline or the service is down: the greeting simply shows no weather. */
export async function delhiWeather(): Promise<Weather | null> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.w
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(URL, { signal: ctrl.signal })
    if (!res.ok) return cached?.w ?? null
    const j = await res.json()
    const day = j.current.is_day === 1
    const w: Weather = {
      temp: Math.round(j.current.temperature_2m),
      high: Math.round(j.daily.temperature_2m_max[0]),
      low: Math.round(j.daily.temperature_2m_min[0]),
      day,
      ...describe(j.current.weather_code, day),
    }
    cached = { at: Date.now(), w }
    return w
  } catch {
    return cached?.w ?? null
  } finally {
    clearTimeout(timer)
  }
}
