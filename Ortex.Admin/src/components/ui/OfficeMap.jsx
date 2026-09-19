import { useEffect, useRef, useState } from "react"
import { cn } from "../../lib/cn"

// The office-location map (Attendance → Settings, Super Admin only). Leaflet
// over OpenStreetMap: no API key, no billing account, and a satellite layer
// (Esri World Imagery) so a factory is recognised by its roof, not guessed
// from a street name.
//
//   · click the map, or drag the pin, to place the office;
//   · the geofence circle follows the radius slider live, drawn to true scale,
//     which is the whole point: 150 m is shown as 150 m of real ground;
//   · other sites are drawn faintly for context and can be clicked to edit.
//
// Leaflet is imported on first use, so it stays out of the main bundle. The pin
// is a styled divIcon rather than Leaflet's default image marker, whose image
// paths break under a bundler.

const DELHI = { lat: 28.6219, lng: 77.055 } // Uttam Nagar, the factory's area

const TILES = {
  map: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
}

let leafletPromise = null
function loadLeaflet() {
  if (!leafletPromise) {
    leafletPromise = Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]).then(([m]) => m.default || m)
  }
  return leafletPromise
}

const pinIcon = (L, tone = "primary") =>
  L.divIcon({
    className: "",
    html: `<span class="ortex-pin ortex-pin-${tone}"></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  })

/**
 * @param {object} p
 * @param {number|null} p.lat
 * @param {number|null} p.lng
 * @param {number} [p.radius]    metres; draws the fence around the pin
 * @param {(c:{lat:number,lng:number})=>void} [p.onPick]  omit for a read-only map
 * @param {Array<{id:string,name:string,lat:number,lng:number,radius_m:number,active?:boolean}>} [p.others]
 * @param {(site:object)=>void} [p.onOtherClick]
 * @param {string} [p.className]
 */
export default function OfficeMap({ lat, lng, radius, onPick, others = [], onOtherClick, className }) {
  const el = useRef(null)
  const map = useRef(null)
  const L = useRef(null)
  const layers = useRef({})
  const pin = useRef(null)
  const circle = useRef(null)
  const othersLayer = useRef(null)
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const [base, setBase] = useState("map")
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng)

  // Create once.
  useEffect(() => {
    let alive = true
    loadLeaflet()
      .then((Lf) => {
        if (!alive || !el.current || map.current) return
        L.current = Lf
        const start = hasPoint ? [lat, lng] : [DELHI.lat, DELHI.lng]
        const m = Lf.map(el.current, { zoomControl: true, attributionControl: true }).setView(start, hasPoint ? 17 : 12)
        layers.current = {
          map: Lf.tileLayer(TILES.map.url, TILES.map),
          satellite: Lf.tileLayer(TILES.satellite.url, TILES.satellite),
        }
        layers.current.map.addTo(m)
        othersLayer.current = Lf.layerGroup().addTo(m)
        m.on("click", (e) => pickRef.current?.({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) }))
        map.current = m
        setReady(true)
        // A map created inside an opening modal measures a zero-size box; tell
        // it the real size once the modal has laid out.
        setTimeout(() => m.invalidateSize(), 150)
      })
      .catch(() => setFailed(true))
    return () => {
      alive = false
      map.current?.remove()
      map.current = null
    }
    // Created once; later props are applied by the effects below.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Base layer.
  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    for (const [k, layer] of Object.entries(layers.current)) {
      if (k === base) layer.addTo(m)
      else m.removeLayer(layer)
    }
  }, [base, ready])

  // The pin and its fence.
  useEffect(() => {
    const m = map.current
    const Lf = L.current
    if (!ready || !m || !Lf) return
    if (!hasPoint) {
      pin.current?.remove()
      circle.current?.remove()
      pin.current = null
      circle.current = null
      return
    }
    const at = [lat, lng]
    if (!pin.current) {
      pin.current = Lf.marker(at, { icon: pinIcon(Lf), draggable: Boolean(pickRef.current), keyboard: true, title: "Office" }).addTo(m)
      pin.current.on("dragend", () => {
        const p = pin.current.getLatLng()
        pickRef.current?.({ lat: round6(p.lat), lng: round6(p.lng) })
      })
      m.setView(at, Math.max(m.getZoom(), 17))
    } else {
      pin.current.setLatLng(at)
    }
    if (radius) {
      if (!circle.current) {
        circle.current = Lf.circle(at, { radius, className: "ortex-fence", weight: 2 }).addTo(m)
      } else {
        circle.current.setLatLng(at)
        circle.current.setRadius(radius)
      }
    }
  }, [lat, lng, radius, hasPoint, ready])

  // Keep the fence in view when it grows past the screen.
  useEffect(() => {
    const m = map.current
    if (!ready || !m || !circle.current) return
    const b = circle.current.getBounds()
    if (!m.getBounds().contains(b)) m.fitBounds(b, { padding: [24, 24] })
  }, [radius, ready])

  // Other sites, faint, clickable.
  useEffect(() => {
    const Lf = L.current
    const group = othersLayer.current
    if (!ready || !Lf || !group) return
    group.clearLayers()
    for (const s of others) {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue
      const c = Lf.circle([s.lat, s.lng], {
        radius: s.radius_m,
        className: s.active === false ? "ortex-fence-off" : "ortex-fence-other",
        weight: 1.5,
      })
      const mk = Lf.marker([s.lat, s.lng], { icon: pinIcon(Lf, s.active === false ? "off" : "other"), title: s.name })
      mk.bindTooltip(s.name, { direction: "top", offset: [0, -26] })
      if (onOtherClick) {
        mk.on("click", () => onOtherClick(s))
        c.on("click", () => onOtherClick(s))
      }
      group.addLayer(c)
      group.addLayer(mk)
    }
    // An overview with no pin of its own frames everything it shows.
    if (!hasPoint && others.length) {
      const pts = others.filter((s) => Number.isFinite(s.lat)).map((s) => [s.lat, s.lng])
      if (pts.length === 1) map.current.setView(pts[0], 16)
      else if (pts.length > 1) map.current.fitBounds(pts, { padding: [40, 40] })
    }
  }, [others, ready, hasPoint, onOtherClick])

  /** Move the view (used by search and "use my location"). */
  useEffect(() => {
    if (ready && hasPoint && map.current && !map.current.getBounds().contains([lat, lng])) {
      map.current.setView([lat, lng], Math.max(map.current.getZoom(), 17))
    }
  }, [lat, lng, ready, hasPoint])

  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-border bg-subtle", className)}>
      <div ref={el} className="h-full min-h-[260px] w-full" role="application" aria-label="Office location map" />
      {ready && (
        <div className="absolute right-3 top-3 z-[500] flex overflow-hidden rounded-btn border border-border bg-card text-xs font-medium">
          {["map", "satellite"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setBase(k)}
              className={cn(
                "px-3 py-1.5 capitalize transition-colors",
                base === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-subtle",
              )}
              aria-pressed={base === k}
            >
              {k}
            </button>
          ))}
        </div>
      )}
      {!ready && !failed && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Loading the map…</div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">
          The map could not load. Check the internet connection, or type the latitude and longitude below.
        </div>
      )}
      {ready && onPick && !hasPoint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center">
          <span className="rounded-btn bg-card px-3 py-1.5 text-xs font-medium text-foreground">
            Click the map to drop the office pin
          </span>
        </div>
      )}
    </div>
  )
}

const round6 = (n) => Math.round(n * 1e6) / 1e6
