// The words for an audit_log row (migration 0023), shared by the per-person
// timeline on /users/:id and the Dashboard's Recent activity.
//
// audit_log stores the table name. These are the words people use for them, and
// the route to open the record where one exists. Quotations, invoices and the
// rest are edited inside their list pages rather than at their own URL, so only
// the two collections with a real detail route are linked; the others are named
// and left alone rather than pointed at a page that would 404.
export const AUDIT_COLLECTIONS = {
  products: { label: "Product" },
  categories: { label: "Category" },
  customers: { label: "Customer", route: (id) => `/customers/${id}` },
  enquiries: { label: "Enquiry", route: (id) => `/enquiries/${id}` },
  leads: { label: "Lead" },
  quotations: { label: "Quotation" },
  invoices: { label: "Invoice" },
  payments: { label: "Payment" },
  work: { label: "Work photo" },
  social: { label: "Social post" },
  automation_rules: { label: "Automation rule" },
  message_templates: { label: "Message template" },
  telecaller_jobs: { label: "Telecaller job" },
}

export const ACTION_TONE = { insert: "emerald", update: "blue", delete: "rose" }
export const ACTION_VERB = { insert: "Created", update: "Edited", delete: "Deleted" }

export const collectionLabel = (name) => AUDIT_COLLECTIONS[name]?.label || name

// A change is listed by the fields that moved, so "what did they do to it" is
// answerable without opening the record. Names only: the per-record Activity
// card carries the from/to values, and repeating them here would turn a day's
// work into a wall of JSON.
export function changedFields(entry) {
  if (entry.action !== "update") return []
  return Object.keys(entry.changes || {})
    .map((k) => k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase())
    .slice(0, 8)
}
