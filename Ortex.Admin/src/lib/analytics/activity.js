// user_activities carry human labels ("Product search"); event_logs carry
// machine names ("search_performed"). Classify both to one vocabulary so counts
// don't silently miss half the data.
export function classifyActivity(a) {
  const t = String(a.activityType || a.eventType || "").toLowerCase()
  if (t.includes("search")) return "search"
  if (t.includes("cart")) return "cart"
  if (t.includes("visit") || t.includes("view")) return "view"
  if (t.includes("quote")) return "quote"
  if (t.includes("contact")) return "contact"
  if (t.includes("pdf") || t.includes("download")) return "download"
  return "other"
}
