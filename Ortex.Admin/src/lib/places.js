// Place lookups for the office-location map (components/ui/OfficeMap.jsx).
// Kept out of the component file so Fast Refresh keeps working on it.

const round6 = (n) => Math.round(n * 1e6) / 1e6

/**
 * Address search through OpenStreetMap's Nominatim (free, no key; its policy
 * asks for occasional, human-driven use, which one admin typing an address is).
 * Biased to India.
 */
export async function searchPlaces(query) {
  const q = String(query || "").trim()
  if (q.length < 3) return []
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=in&addressdetails=0&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: { Accept: "application/json" } })
  if (!res.ok) throw new Error("Search is not available right now")
  const rows = await res.json()
  return rows.map((r) => ({ label: r.display_name, lat: round6(Number(r.lat)), lng: round6(Number(r.lon)) }))
}

/** The street address at a point, for the Address field. */
export async function addressAt(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`
  const res = await fetch(url, { headers: { Accept: "application/json" } })
  if (!res.ok) return ""
  const r = await res.json()
  return r?.display_name || ""
}

/** This computer's location, for an admin standing in the office. */
export function locateMe() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser cannot share its location"))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round6(p.coords.latitude), lng: round6(p.coords.longitude), accuracy: Math.round(p.coords.accuracy) }),
      (e) => reject(new Error(e.code === 1 ? "Location permission was refused" : "Your location could not be found")),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  })
}
