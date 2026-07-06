// Website lead capture → shared backend.
//
// Contact form and Quote calculator submissions are inserted into the same
// `enquiries` table the admin console reads, so they show up live in the
// back-office (source tags them "Website contact form" / "Quote calculator").
// RLS allows anonymous inserts into enquiries only. If no backend is configured
// it falls back to localStorage so the site still works standalone.

import { supabase, hasSupabase } from "./supabaseClient"

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

  if (!hasSupabase) {
    return { error: "Database offline. Please try again or contact us directly via WhatsApp." }
  }

  const { error } = await supabase.from("enquiries").insert({ doc })
  return error ? { error: error.message } : { ok: true }
}
