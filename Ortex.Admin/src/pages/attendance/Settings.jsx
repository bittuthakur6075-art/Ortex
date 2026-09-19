import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Globe, MapPin, Pencil, Plus, Search, Target, Trash2 } from "../../components/ui/Icons"
import OfficeMap from "../../components/ui/OfficeMap"
import { addressAt, locateMe, searchPlaces } from "../../lib/places"
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  Chip,
  ChipGroup,
  EmptyState,
  Field,
  Input,
  Modal,
  PageLoader,
  Select,
  Textarea,
} from "../../components/ui/Ui"
import { roleLabel, ROLE_TONE } from "../../lib/roles"
import { durationWords } from "../../lib/attendance"
import {
  defaultModeFor,
  deleteSite,
  getSettings,
  listPeopleModes,
  listSites,
  saveSettings,
  savePersonMode,
  saveSite,
} from "../../services/attendance"
import { listProfiles } from "../../services/users"

// Attendance → Settings, the Super Admin's: office locations, the rules, and
// how each person clocks in. Every input the module needs lives here, shipped
// with defaults (migration 0033), and the database refuses these writes from
// anyone but the Super Admin.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Pull coordinates out of a pasted Google Maps link, or null. */
function coordsFromMapsLink(text) {
  const s = String(text || "")
  const pats = [/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, /[?&](?:q|ll|query|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/]
  for (const p of pats) {
    const m = s.match(p)
    if (m) {
      const lat = Number(m[1])
      const lng = Number(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
    }
  }
  const bare = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (bare) return { lat: Number(bare[1]), lng: Number(bare[2]) }
  return null
}

const mapsUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`

export default function AttendanceSettings() {
  return (
    <div className="space-y-5">
      <Banner tone="info">Only you, the Super Admin, can change these. Changes apply from now on.</Banner>
      <Sites />
      <Rules />
      <People />
    </div>
  )
}

// ---- office locations -----------------------------------------------------------------

function Sites() {
  const [state, setState] = useState({ loading: true })
  const [editing, setEditing] = useState(null) // site or "new"

  const load = useCallback(async () => setState({ loading: false, ...(await listSites()) }), [])
  useEffect(() => {
    void load()
  }, [load])

  const remove = async (site) => {
    if (!window.confirm(`Remove "${site.name}"? Past punches keep its name; new clock-ins can no longer use it.`)) return
    try {
      await deleteSite(site.id)
      toast.success("Location removed")
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  if (state.loading) return <Card className="p-6"><PageLoader /></Card>
  if (state.missing) return <Banner tone="warning">Attendance is not set up on this database yet (migration 0033).</Banner>

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Office locations"
        description="Where office staff can clock in. Field staff clock in anywhere."
        action={<Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add location</Button>}
      />
      {state.error && <Banner tone="danger" className="mx-5 mb-4">{state.error}</Banner>}
      {state.rows.length > 0 && (
        <div className="px-5 pb-4">
          {/* Every office and its fence, to true scale. Click one to edit it. */}
          <OfficeMap lat={null} lng={null} others={state.rows} onOtherClick={setEditing} className="h-72" />
        </div>
      )}
      {state.rows.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No office location yet"
          description="Office staff cannot clock in until one is added. Add the factory first."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="mt-head">
              <tr className="text-left">
                <th>Name</th>
                <th>Address</th>
                <th>Radius</th>
                <th>Status</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody className="mt-body">
              {state.rows.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium text-foreground">{s.name}</td>
                  <td className="text-muted-foreground">{s.address || `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`}</td>
                  <td className="tabular">{s.radius_m} m</td>
                  <td><Badge tone={s.active ? "emerald" : "slate"}>{s.active ? "Active" : "Off"}</Badge></td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" icon aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" icon aria-label={`Remove ${s.name}`} onClick={() => remove(s)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <SiteEditor
          site={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </Card>
  )
}

function SiteEditor({ site, onClose, onSaved }) {
  const [form, setForm] = useState({
    id: site?.id,
    name: site?.name || "",
    address: site?.address || "",
    lat: site?.lat ?? "",
    lng: site?.lng ?? "",
    radius_m: site?.radius_m ?? 150,
    active: site?.active ?? true,
  })
  const [link, setLink] = useState("")
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  /** A new pin from the map, a search result or this computer's location. */
  const placePin = ({ lat, lng }) => setForm((f) => ({ ...f, lat, lng }))

  const runSearch = async (e) => {
    e?.preventDefault?.()
    if (query.trim().length < 3) return toast.error("Type at least 3 letters of the address or area")
    setSearching(true)
    try {
      const rows = await searchPlaces(query)
      setResults(rows)
      if (!rows.length) toast.error("No place found. Try the area and city, or drop the pin by hand.")
    } catch (err) {
      toast.error(err.message)
    }
    setSearching(false)
  }

  const useMyLocation = async () => {
    setLocating(true)
    try {
      const here = await locateMe()
      placePin(here)
      toast.success(`Pin placed where this computer is (accurate to about ${here.accuracy} m). Drag it onto the building if needed.`)
    } catch (err) {
      toast.error(err.message)
    }
    setLocating(false)
  }

  const fillAddress = async () => {
    if (!coordsOk) return
    const a = await addressAt(lat, lng).catch(() => "")
    if (a) set("address", a)
    else toast.error("No address found for this pin. Type it in.")
  }

  const pasteLink = (v) => {
    setLink(v)
    const c = coordsFromMapsLink(v)
    if (c) {
      setForm((f) => ({ ...f, lat: c.lat, lng: c.lng }))
      toast.success("Coordinates filled in from the link")
    }
  }

  const lat = Number(form.lat)
  const lng = Number(form.lng)
  const coordsOk = form.lat !== "" && form.lng !== "" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

  const save = async () => {
    if (!form.name.trim()) return toast.error("Give the location a name")
    if (!coordsOk) return toast.error("Add the latitude and longitude, or paste a Google Maps link")
    setBusy(true)
    try {
      await saveSite(form)
      toast.success(site ? "Location updated" : "Location added")
      onSaved()
    } catch (e) {
      toast.error(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-3xl"
      title={site ? `Edit ${site.name}` : "Add office location"}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save location"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <Input id="site-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="For example: Uttam Nagar factory" />
        </Field>
        <Field label="Address">
          <div className="flex gap-2">
            <Input id="site-address" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, area, city" />
            <Button type="button" size="sm" variant="outline" onClick={fillAddress} disabled={!coordsOk}>
              <MapPin className="h-4 w-4" /> From pin
            </Button>
          </div>
        </Field>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={runSearch} className="flex min-w-0 flex-1 gap-2">
              <Input
                id="site-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search an address or area, e.g. Uttam Nagar, Delhi"
              />
              <Button type="submit" size="sm" variant="outline" disabled={searching}>
                <Search className="h-4 w-4" /> {searching ? "Searching…" : "Search"}
              </Button>
            </form>
            <Button type="button" size="sm" variant="outline" onClick={useMyLocation} disabled={locating}>
              <Target className="h-4 w-4" /> {locating ? "Locating…" : "Use my location"}
            </Button>
          </div>
          {results && results.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-border bg-card text-sm">
              {results.map((r) => (
                <li key={`${r.lat},${r.lng}`}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-foreground hover:bg-subtle"
                    onClick={() => {
                      placePin(r)
                      if (!form.address) set("address", r.label)
                      setResults(null)
                    }}
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <OfficeMap
            lat={coordsOk ? lat : null}
            lng={coordsOk ? lng : null}
            radius={form.radius_m}
            onPick={placePin}
            className="h-80"
          />
          <p className="text-xs text-muted-foreground">
            Click the map or drag the pin onto the building. Switch to Satellite to see the roof. The blue circle is the
            area staff must be inside to clock in, drawn to scale.
          </p>
        </div>
        <Field label="Or paste a Google Maps link" hint="Drop a pin in Google Maps, share it, and paste the link here. Coordinates also work: 28.6219, 77.0550">
          <Input id="site-link" value={link} onChange={(e) => pasteLink(e.target.value)} placeholder="https://maps.app.goo.gl/… or https://www.google.com/maps/@28.62,77.05" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitude" required>
            <Input id="site-lat" inputMode="decimal" value={form.lat} onChange={(e) => set("lat", e.target.value)} placeholder="28.62190" />
          </Field>
          <Field label="Longitude" required>
            <Input id="site-lng" inputMode="decimal" value={form.lng} onChange={(e) => set("lng", e.target.value)} placeholder="77.05500" />
          </Field>
        </div>
        <Field label={`Radius: ${form.radius_m} m`} hint="150 m suits most buildings. Inside a metal-roofed shed, phones are often 50 to 100 m out.">
          <input
            id="site-radius"
            type="range"
            min={30}
            max={2000}
            step={10}
            value={form.radius_m}
            onChange={(e) => set("radius_m", Number(e.target.value))}
            className="w-full accent-primary"
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              id="site-active"
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
            />
            Staff can clock in here
          </label>
          {coordsOk && (
            <a
              href={mapsUrl(lat, lng)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Globe className="h-4 w-4" /> Open in Google Maps
            </a>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ---- rules ------------------------------------------------------------------------------

function Rules() {
  const [state, setState] = useState({ loading: true })
  const [doc, setDoc] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getSettings().then((res) => {
      setState({ loading: false, ...res })
      setDoc(res.doc || {})
    })
  }, [])

  if (state.loading) return <Card className="p-6"><PageLoader /></Card>
  if (state.missing) return null

  const set = (k, v) => setDoc((d) => ({ ...d, [k]: v }))
  const shift = doc.shift || {}
  const weeklyOff = Array.isArray(doc.weeklyOff) ? doc.weeklyOff : []
  const num = (k, fallback) => (doc[k] ?? fallback)

  const save = async () => {
    setBusy(true)
    try {
      const saved = await saveSettings(doc)
      setDoc(saved)
      toast.success("Attendance rules saved. They apply from now on.")
    } catch (e) {
      toast.error(e.message)
    }
    setBusy(false)
  }

  const minutesField = (k, label, fallback, hint) => (
    <Field label={`${label} (${durationWords(num(k, fallback))})`} hint={hint}>
      <Input id={`rule-${k}`} type="number" min={0} value={num(k, fallback)} onChange={(e) => set(k, Number(e.target.value))} />
    </Field>
  )

  return (
    <Card>
      <CardHeader
        title="Rules"
        description="Changes apply from now on. Days already worked keep the rules they were recorded under."
        action={<Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save rules"}</Button>}
      />
      <div className="grid grid-cols-1 gap-5 px-5 pb-6 md:grid-cols-2">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Shift starts">
            <Input id="rule-shift-start" type="time" value={shift.start || "09:30"} onChange={(e) => set("shift", { ...shift, start: e.target.value })} />
          </Field>
          <Field label="Shift ends">
            <Input id="rule-shift-end" type="time" value={shift.end || "18:30"} onChange={(e) => set("shift", { ...shift, end: e.target.value })} />
          </Field>
        </div>
        <Field label="Weekly off">
          <ChipGroup>
            {WEEKDAYS.map((d, i) => (
              <Chip
                key={d}
                active={weeklyOff.includes(i)}
                onClick={() => set("weeklyOff", weeklyOff.includes(i) ? weeklyOff.filter((x) => x !== i) : [...weeklyOff, i].sort())}
              >
                {d}
              </Chip>
            ))}
          </ChipGroup>
        </Field>
        <Field label="Saturday">
          <Select id="rule-saturday" value={doc.saturday || "full"} onChange={(e) => set("saturday", e.target.value)}>
            <option value="full">Full working day</option>
            <option value="half">Half day</option>
          </Select>
        </Field>
        <Field label="Grace period (minutes)" hint="Clocking in later than this after the shift starts is a late mark.">
          <Input id="rule-grace" type="number" min={0} max={120} value={num("graceMin", 15)} onChange={(e) => set("graceMin", Number(e.target.value))} />
        </Field>
        {minutesField("halfDayBelowMin", "Half day if worked under, minutes", 270)}
        {minutesField("absentBelowMin", "Absent if worked under, minutes", 120)}
        {minutesField("autoCloseAfterMin", "Auto clock-out after shift end, minutes", 240, "A missed clock-out is closed this long after the shift and marked for correction.")}
        <Field label="Corrections allowed a month">
          <Input id="rule-corrections" type="number" min={0} max={31} value={num("correctionsPerMonth", 3)} onChange={(e) => set("correctionsPerMonth", Number(e.target.value))} />
        </Field>
        <Field label="Weakest location accepted (metres)" hint="A reading less accurate than this asks the person to try again near a window.">
          <Input id="rule-accuracy" type="number" min={10} max={500} value={num("maxAccuracyM", 100)} onChange={(e) => set("maxAccuracyM", Number(e.target.value))} />
        </Field>
        <Field label="Phone clock allowed off by (minutes)" hint="More than this flags the punch for review. The server's time is always the one recorded.">
          <Input id="rule-skew" type="number" min={1} max={60} value={num("clockSkewMin", 5)} onChange={(e) => set("clockSkewMin", Number(e.target.value))} />
        </Field>
        <Field label="Keep selfies for (days)" hint="Older selfies are deleted automatically. Attendance records themselves are kept.">
          <Input id="rule-retention" type="number" min={7} max={730} value={num("selfieRetentionDays", 90)} onChange={(e) => set("selfieRetentionDays", Number(e.target.value))} />
        </Field>
        <label className="flex items-start gap-2.5 self-center text-sm text-foreground">
          <input
            id="rule-inside"
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            checked={doc.mustBeInside !== false}
            onChange={(e) => set("mustBeInside", e.target.checked)}
          />
          <span>
            <span className="font-medium">Office staff must be inside an office location to clock in</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Off: they can clock in from anywhere, and it is flagged for review.</span>
          </span>
        </label>
        <Field label="Notice shown before the first clock-in" hint="What is recorded, why, for how long, and who sees it." className="md:col-span-2">
          <Textarea id="rule-notice" rows={4} value={doc.notice || ""} onChange={(e) => set("notice", e.target.value)} />
        </Field>
      </div>
    </Card>
  )
}

// ---- people -------------------------------------------------------------------------------

function People() {
  const [state, setState] = useState({ loading: true })

  const load = useCallback(async () => {
    const [profiles, modes, sites] = await Promise.all([listProfiles().catch(() => []), listPeopleModes(), listSites()])
    setState({ loading: false, profiles: (profiles || []).filter((p) => p.active), modes: modes.byUser, sites: sites.rows, missing: modes.missing })
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  if (state.loading) return <Card className="p-6"><PageLoader /></Card>
  if (state.missing) return null

  return (
    <Card className="overflow-hidden">
      <CardHeader title="People" description="How each person clocks in. Field staff have no fence; their location is still recorded." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="mt-head">
            <tr className="text-left">
              <th>Person</th>
              <th>Role</th>
              <th>Clocks in as</th>
              <th>Office locations</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody className="mt-body">
            {state.profiles.map((p) => (
              <PersonRow key={p.id} person={p} row={state.modes[p.id]} sites={state.sites} onSaved={load} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function PersonRow({ person, row, sites, onSaved }) {
  const [mode, setMode] = useState(row?.mode || "")
  const [siteIds, setSiteIds] = useState(row?.site_ids || [])
  const [busy, setBusy] = useState(false)
  const dirty = (row?.mode || "") !== mode || !sameSet(row?.site_ids || [], siteIds)
  const def = defaultModeFor(person.role)
  const effective = mode || def

  const toggleSite = (id) => setSiteIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const save = async () => {
    setBusy(true)
    try {
      await savePersonMode(person.id, { mode: mode || null, site_ids: effective === "office" ? siteIds : [] })
      toast.success(`${person.name || person.email} saved`)
      onSaved()
    } catch (e) {
      toast.error(e.message)
    }
    setBusy(false)
  }

  const activeSites = useMemo(() => sites.filter((s) => s.active), [sites])

  return (
    <tr>
      <td>
        <div className="flex items-center gap-3">
          <Avatar name={person.name || person.email} src={person.avatar_url} className="h-8 w-8" />
          <span className="font-medium text-foreground">{person.name || person.email}</span>
        </div>
      </td>
      <td><Badge tone={ROLE_TONE[person.role] || "slate"}>{roleLabel(person.role)}</Badge></td>
      <td className="min-w-[190px]">
        <Select id={`mode-${person.id}`} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">Default ({def === "field" ? "Field" : "Office"})</option>
          <option value="office">Office</option>
          <option value="field">Field</option>
        </Select>
      </td>
      <td>
        {effective === "field" ? (
          <span className="text-muted-foreground">Anywhere (field)</span>
        ) : activeSites.length === 0 ? (
          <span className="text-muted-foreground">Add an office location first</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Chip active={siteIds.length === 0} onClick={() => setSiteIds([])}>All locations</Chip>
            {activeSites.map((s) => (
              <Chip key={s.id} active={siteIds.includes(s.id)} onClick={() => toggleSite(s.id)}>{s.name}</Chip>
            ))}
          </div>
        )}
      </td>
      <td className="text-right">
        <Button size="sm" variant={dirty ? "primary" : "outline"} disabled={!dirty || busy} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </td>
    </tr>
  )
}

function sameSet(a, b) {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}
