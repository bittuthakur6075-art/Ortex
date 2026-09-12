import { supabase, hasSupabase } from "./supabaseClient"
import { hasAnalyticsConsent } from "./consent"

// Returned instead of real IP/location when the visitor has not opted in.
const NO_LOCATION = {
  ip: null,
  city: "Not collected",
  region: "Not collected",
  country: "Not collected",
  postal: null,
  isp: null,
  latitude: null,
  longitude: null,
  location: "Not collected",
}

// Generate or retrieve tracking user ID and session ID. Exported so lead
// capture can stamp the same ids onto the enquiry, giving the admin Growth
// dashboard a deterministic behavior→revenue join key.
export function getTrackingIds() {
  let userId = localStorage.getItem("ortex_tracking_user_id")
  if (!userId) {
    userId = "usr_" + Math.random().toString(36).substring(2, 11)
    localStorage.setItem("ortex_tracking_user_id", userId)
  }

  let sessionId = sessionStorage.getItem("ortex_tracking_session_id")
  if (!sessionId) {
    sessionId = "sess_" + Math.random().toString(36).substring(2, 11)
    sessionStorage.setItem("ortex_tracking_session_id", sessionId)
  }

  return { userId, sessionId }
}

// Parse user-agent for basic system details
function getUAInfo() {
  const ua = navigator.userAgent
  let browser = "Unknown Browser"
  let os = "Unknown OS"
  let device = "Desktop"

  if (/mobile/i.test(ua)) {
    device = "Mobile"
  } else if (/tablet/i.test(ua)) {
    device = "Tablet"
  }

  if (/chrome|crios/i.test(ua) && !/edge|opr/i.test(ua)) {
    browser = "Chrome"
  } else if (/safari/i.test(ua) && !/chrome|crios|edge|opr/i.test(ua)) {
    browser = "Safari"
  } else if (/firefox|fxios/i.test(ua)) {
    browser = "Firefox"
  } else if (/edge|edg/i.test(ua)) {
    browser = "Edge"
  } else if (/opr/i.test(ua)) {
    browser = "Opera"
  }

  if (/windows/i.test(ua)) {
    os = "Windows"
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = "macOS"
  } else if (/android/i.test(ua)) {
    os = "Android"
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = "iOS"
  } else if (/linux/i.test(ua)) {
    os = "Linux"
  }

  return { browser, os, device }
}

// Fetch public IP and location details asynchronously (best effort).
// Gated on consent — no third-party call is made, and no IP is stored, until
// the visitor opts in via the cookie banner.
let cachedLocation = null
async function getLocationData() {
  if (!hasAnalyticsConsent()) return NO_LOCATION
  if (cachedLocation) return cachedLocation
  try {
    const res = await fetch("https://ipapi.co/json/")
    if (!res.ok) throw new Error("Failed to fetch location data")
    const data = await res.json()
    // Everything the lookup knows about where they are. postal/isp/lat-long
    // were being thrown away, and they are what turns "New Delhi" into a place
    // a salesperson can act on: the ISP tells a mobile-network guess (which can
    // be the operator's gateway city) apart from a broadband one, which is the
    // visitor's own exchange.
    cachedLocation = {
      ip: data.ip || "127.0.0.1",
      city: data.city || "Unknown City",
      region: data.region || "Unknown Region",
      country: data.country_name || "Unknown Country",
      postal: data.postal || null,
      isp: data.org || null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      location: data.city && data.country_name ? `${data.city}, ${data.region ? data.region + ', ' : ''}${data.country_name}` : "Unknown Location"
    }
    return cachedLocation
  } catch (err) {
    console.warn("Geolocation fetch failed, trying the second provider:", err)
    // ipapi.co's free tier is 1,000 lookups a day and answers 429 after that,
    // which used to drop every later visitor to an IP with "Unknown City". The
    // fallback is a second geolocator rather than a bare IP echo, so a busy day
    // costs precision, not the place itself.
    try {
      const res = await fetch("https://ipwho.is/")
      const data = await res.json()
      if (!data || data.success === false) throw new Error(data?.message || "ipwho.is lookup failed")
      cachedLocation = {
        ip: data.ip || "127.0.0.1",
        city: data.city || "Unknown City",
        region: data.region || "Unknown Region",
        country: data.country || "Unknown Country",
        postal: data.postal || null,
        isp: data.connection?.isp || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        location: data.city && data.country ? `${data.city}, ${data.region ? data.region + ', ' : ''}${data.country}` : "Unknown Location"
      }
      return cachedLocation
    } catch {
      return {
        ip: "127.0.0.1",
        city: "Unknown City",
        region: "Unknown Region",
        country: "Unknown Country",
        location: "Unknown Location"
      }
    }
  }
}

// ---- Page views -------------------------------------------------------------
//
// Every route the site actually serves, mapped to the label written to
// user_activities.activityType. The old map was an ecommerce taxonomy borrowed
// wholesale: /about was logged as "Category browsing", /quote as "Checkout",
// /contact as "Product inquiry" and the four legal pages as "File download",
// and anything not listed fell through to "Category browsing" too. So the
// console's Web events table described visits that never happened, and the
// admin's classifyActivity() (which reads these strings) counted a privacy-page
// read as a catalogue download and a contact-page read as a contact enquiry.
// Every label here says "visit" or "view" so it classifies as a view, and the
// page name travels in metadata so the table can name the page, not just "/".
const PAGE_ACTIVITY = {
  "/": ["Home page visit", "Home"],
  "/products": ["Catalog view", "Products"],
  "/industries": ["Industries page visit", "Industries"],
  "/oem": ["OEM page visit", "OEM & white label"],
  "/work": ["Work gallery visit", "Our work"],
  "/about": ["About page visit", "About"],
  "/contact": ["Contact page visit", "Contact"],
  "/quote": ["Quote builder visit", "Quote builder"],
  "/faq": ["FAQ page visit", "FAQ"],
  "/privacy": ["Policy page visit", "Privacy policy"],
  "/terms": ["Policy page visit", "Terms"],
  "/cookies": ["Policy page visit", "Cookie policy"],
  "/acceptable-use": ["Policy page visit", "Acceptable use"],
}

// A path we do not serve is a 404, and saying so is the point: an unknown
// route used to be indistinguishable from a browse.
export function activityForPath(path) {
  const clean = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path
  const hit = PAGE_ACTIVITY[clean]
  if (hit) return { activityType: hit[0], page: hit[1] }
  // /products/<slug> is a category page, the only dynamic route we serve.
  if (clean.startsWith("/products/")) return { activityType: "Catalog view", page: "Category: " + clean.slice(10) }
  return { activityType: "Not found page visit", page: "Not found" }
}

// A route change fires this, not trackActivity directly. Two reasons:
// the 300ms debounce collapses React's development double-effect and a
// redirect's two-step ("/portfolio" -> "/work") into the one visit that
// really happened, and by the time it runs the lazy page has set
// document.title, so the row can carry the page's real title.
let viewTimer = null
let lastView = { key: "", at: 0 }
const VIEW_DEDUPE_MS = 5000

export function trackPageView({ pathname, search = "" }) {
  const params = new URLSearchParams(search)
  const searchQuery = params.get("search") || params.get("q")
  const productName = params.get("product")

  clearTimeout(viewTimer)
  viewTimer = setTimeout(() => {
    const key = pathname + search
    const now = Date.now()
    if (key === lastView.key && now - lastView.at < VIEW_DEDUPE_MS) return
    lastView = { key, at: now }

    const { activityType, page } = activityForPath(pathname)
    const base = { page, pageTitle: document.title }

    if (searchQuery) trackActivity({ activityType: "Product search", metadata: { ...base, searchQuery } })
    if (productName) trackActivity({ activityType: "Product page visit", productId: productName, metadata: { ...base, productName } })
    else trackActivity({ activityType, metadata: base })
  }, 300)
}

// A dev server writes to the same analytics tables the live site does, there
// is no separate environment for them. An afternoon of `npm run dev` therefore
// arrives in the console as thousands of visits from one office IP and is
// counted by the Growth funnel. Local traffic is not recorded unless someone
// asks for it with VITE_TRACK_LOCAL=true, which is how you test this file
// itself. (supabase/maintenance/remove-local-traffic.sql clears what earlier
// dev sessions already wrote.)
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "192.168.", "10.0.", "10.1."]
export const isLocalTraffic = () => {
  if (import.meta.env.VITE_TRACK_LOCAL === "true") return false
  // An IPv6 literal arrives bracketed ("[::1]"); compare the address itself.
  const host = window.location.hostname.replaceAll("[", "").replaceAll("]", "")
  return LOCAL_HOSTS.some((h) => host === h || host.startsWith(h)) || host.endsWith(".local")
}

// Main track function
export async function trackActivity({ activityType, productId = null, metadata = {} }) {
  if (isLocalTraffic()) return
  const { userId, sessionId } = getTrackingIds()
  const { browser, os, device } = getUAInfo()
  const loc = await getLocationData()

  const doc = {
    userId,
    sessionId,
    productId,
    activityType,
    pageUrl: window.location.pathname + window.location.search,
    referrer: document.referrer || "Direct",
    timestamp: new Date().toISOString(),
    device,
    browser,
    operatingSystem: os,
    ipAddress: loc.ip,
    city: loc.city,
    region: loc.region,
    country: loc.country,
    postal: loc.postal,
    isp: loc.isp,
    latitude: loc.latitude,
    longitude: loc.longitude,
    location: loc.location,
    metadata,
  }

  // 1. Save activity to database / localStorage
  if (hasSupabase) {
    try {
      await supabase.from("user_activities").insert({ doc })
    } catch (e) {
      console.error("Failed to save activity to Supabase:", e)
    }
  } else {
    try {
      const list = JSON.parse(localStorage.getItem("ortex_user_activities") || "[]")
      list.push({ ...doc, id: "act_" + Date.now() + "_" + Math.floor(Math.random() * 1000) })
      localStorage.setItem("ortex_user_activities", JSON.stringify(list))
    } catch (e) {
      console.warn("LocalStorage write failed:", e)
    }
  }

  // 2. Process Event Generation
  await processEventTrigger(doc)
}

// The automation function only accepts these trigger events (ALLOWED_EVENTS in
// Ortex.Admin/supabase/functions/automation-engine/index.ts, its guard against
// the public trigger surface being abused); anything else is answered with a
// 400 "Unsupported eventType". Keep this list in step with that one. Events
// outside it are still written to `event_logs`, they just do not fire rules.
const AUTOMATION_EVENTS = new Set([
  "quote_requested",
  "contact_form_submitted",
  "product_visited",
  "search_performed",
  "pdf_downloaded",
  "cart_added",
])

// Event generation and rule processing
async function processEventTrigger(activity) {
  let eventType = ""
  let description = ""

  // Map activity type to event type
  if (activity.activityType === "Home page visit") {
    eventType = "home_visited"
    description = `User visited the home page.`
  } else if (activity.activityType === "Product page visit") {
    eventType = "product_visited"
    description = `User viewed product: ${activity.metadata?.productName || activity.productId}.`
  } else if (activity.activityType === "Product search") {
    eventType = "search_performed"
    description = `User searched for: "${activity.metadata?.searchQuery}".`
  } else if (activity.activityType === "Contact form submission") {
    eventType = "contact_form_submitted"
    description = `User submitted contact form. Name: ${activity.metadata?.customer?.name}.`
  } else if (activity.activityType === "Quote request") {
    eventType = "quote_requested"
    description = `User requested a quote for ${activity.metadata?.itemsCount || 1} products.`
  } else if (activity.activityType === "Cart actions") {
    eventType = activity.metadata?.action === "add" ? "cart_added" : "cart_removed"
    description = `${activity.metadata?.action === "add" ? "Added" : "Removed"} product ${activity.metadata?.productName} to/from quote cart.`
  } else if (activity.activityType === "Catalog view") {
    eventType = "catalog_viewed"
    description = `User viewed the catalog for: ${activity.metadata?.category || "general"}.`
  } else if (activity.activityType === "PDF download") {
    eventType = "pdf_downloaded"
    description = `User downloaded PDF: ${activity.metadata?.fileName || "catalog"}.`
  } else {
    // Other generic activities
    eventType = "general_activity"
    description = `User performed activity: ${activity.activityType}.`
  }

  const eventDoc = {
    activityId: activity.id || "act_" + Date.now(),
    eventType,
    userId: activity.userId,
    description,
    timestamp: new Date().toISOString(),
    status: "processed",
    metadata: activity.metadata,
  }

  // Save Event Log
  if (hasSupabase) {
    try {
      await supabase.from("event_logs").insert({ doc: eventDoc })
    } catch (e) {
      console.error("Failed to save event log to Supabase:", e)
    }

    // 🔥 Fire server-side automation engine via Supabase Edge Function
    try {
      if (AUTOMATION_EVENTS.has(eventType)) supabase.functions.invoke("automation-engine", {
        body: {
          eventType,
          userId: activity.userId,
          description,
          metadata: activity.metadata || {}
        }
      }).catch(e => console.warn("Automation engine skipped:", e))
    } catch (e) {
      console.warn("Automation engine error:", e)
    }
  } else {
    try {
      const list = JSON.parse(localStorage.getItem("ortex_event_logs") || "[]")
      const eventRecord = { ...eventDoc, id: "evt_" + Date.now() + "_" + Math.floor(Math.random() * 1000) }
      list.push(eventRecord)
      localStorage.setItem("ortex_event_logs", JSON.stringify(list))

      // Trigger client-side automation engine execution (local/dev mode)
      runClientAutomationEngine(eventRecord, activity)
    } catch (e) {
      console.warn("LocalStorage write failed for event log:", e)
    }
  }
}

// Client-side automation engine (for local mode simulation)
function runClientAutomationEngine(event, activity) {
  // Read active rules
  const rules = JSON.parse(localStorage.getItem("ortex_admin_automation_rules") || "[]")
  const templates = JSON.parse(localStorage.getItem("ortex_admin_message_templates") || "[]")
  const customers = activity.metadata?.customer || {}

  // Check matching rules
  const matchingRules = rules.filter(r => r.active && r.triggerEvent === event.eventType)

  matchingRules.forEach(rule => {
    // Generate AI message context
    const customerName = customers.name || "Customer"
    const phone = customers.phone || "+91-9211947188"
    const productName = activity.metadata?.productName || "products"
    const quantity = activity.metadata?.quantity || 100
    const msgContext = `Trigger: ${rule.name}. User activity: ${event.description}. Customer details: ${customerName} (${phone}).`

    // Find template
    const template = templates.find(t => t.id === rule.templateId || t.name === rule.templateId)
    let body = template ? template.body : ""

    if (body) {
      // Replace placeholders
      body = body
        .replace(/{name}/g, customerName)
        .replace(/{product_name}/g, productName)
        .replace(/{quantity}/g, quantity)
        .replace(/{unit}/g, activity.metadata?.unit || "pcs")
        .replace(/{message_snippet}/g, (activity.metadata?.message || "").substring(0, 50))
    } else {
      // AI default generated message
      body = `Hi ${customerName}, thank you for your interest in our ${productName}. Our team is here to assist with custom requirements. - Ortex Sales`
    }

    // Save AI generated message
    const aiMessage = {
      id: "aim_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      eventId: event.id,
      userId: event.userId,
      customerName,
      triggerType: rule.name,
      context: msgContext,
      generatedMessage: body,
      createdAt: new Date().toISOString()
    }

    try {
      const aiMsgs = JSON.parse(localStorage.getItem("ortex_admin_ai_messages") || "[]")
      aiMsgs.push(aiMessage)
      localStorage.setItem("ortex_admin_ai_messages", JSON.stringify(aiMsgs))
    } catch (e) {
      console.warn(e)
    }

    // Queue WhatsApp Message
    const waLog = {
      id: "wal_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      userId: event.userId,
      customerName,
      phone,
      templateName: template?.name || "AI Generated",
      messageText: body,
      status: "queued",
      retryCount: 0,
      maxRetries: 3,
      errorMessage: "",
      responsePayload: null,
      createdAt: new Date().toISOString(),
      sentAt: null
    }

    try {
      const waLogs = JSON.parse(localStorage.getItem("ortex_admin_whatsapp_logs") || "[]")
      waLogs.push(waLog)
      localStorage.setItem("ortex_admin_whatsapp_logs", JSON.stringify(waLogs))

      // Simulate sending WhatsApp in the background
      setTimeout(() => {
        sendMockWhatsApp(waLog.id)
      }, 3000)
    } catch (e) {
      console.warn(e)
    }
  })
}

// Simulate WhatsApp Business API delivery status updates
function sendMockWhatsApp(waLogId) {
  try {
    const waLogs = JSON.parse(localStorage.getItem("ortex_admin_whatsapp_logs") || "[]")
    const idx = waLogs.findIndex(l => l.id === waLogId)
    if (idx !== -1) {
      waLogs[idx].status = "sent"
      waLogs[idx].sentAt = new Date().toISOString()
      waLogs[idx].responsePayload = { success: true, message_id: "wamid.HBgMOTE5MjExOTQ3MTg4FQIAERg2NTBDMDM3QjgxNUI2QkFCRTYA" }
      localStorage.setItem("ortex_admin_whatsapp_logs", JSON.stringify(waLogs))

      // Simulate delivery report in 2 seconds
      setTimeout(() => {
        try {
          const logs = JSON.parse(localStorage.getItem("ortex_admin_whatsapp_logs") || "[]")
          const i = logs.findIndex(l => l.id === waLogId)
          if (i !== -1) {
            logs[i].status = Math.random() > 0.05 ? "delivered" : "failed"
            if (logs[i].status === "failed") {
              logs[i].errorMessage = "API Error: Invalid recipient phone number format."
            }
            localStorage.setItem("ortex_admin_whatsapp_logs", JSON.stringify(logs))
            window.dispatchEvent(new Event("ortex-admin-store-change")) // Refresh admin
          }
        } catch {}
      }, 2000)
    }
  } catch {}
}
