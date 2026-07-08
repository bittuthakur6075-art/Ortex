// Website lead capture → shared backend.
//
// Contact form and Quote calculator submissions are inserted into the same
// `enquiries` table the admin console reads, so they show up live in the
// back-office (source tags them "Website contact form" / "Quote calculator").
// RLS allows anonymous inserts into enquiries only. If no backend is configured
// it falls back to localStorage so the site still works standalone.

import { supabase, hasSupabase } from "./supabaseClient"
import { trackActivity } from "./tracker"

export async function submitEnquiry({ source, customer, productInterest = "", message = "", notes = "" }) {
  const doc = {
    source,
    status: "new",
    starred: false,
    owner: "",
    customer,
    productInterest,
    message,
    notes,
  }

  // Asynchronously track the submission activity
  const isQuote = source === "Quote calculator"
  trackActivity({
    activityType: isQuote ? "Quote request" : "Contact form submission",
    productId: productInterest,
    metadata: {
      customer,
      productName: productInterest,
      message,
    }
  }).catch(err => console.error("Tracking failed:", err))

  if (!hasSupabase) {
    return { error: "Database offline. Please try again or contact us directly via WhatsApp." }
  }

  const { error } = await supabase.from("enquiries").insert({ doc })
  return error ? { error: error.message } : { ok: true }
}
