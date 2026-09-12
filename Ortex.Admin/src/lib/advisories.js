import { formatNumber } from "./format"
import { enquiryAge, rfqArtwork, rfqRateMismatches } from "./quoteRfq"

// What a person must know BEFORE they pick up the phone, in words.
//
// PORTED FROM the field-sales app (Ortex.Mobile/src/features/leads/) — same
// checks, same order, same prose. The phone got these first because a rep in
// the field has nothing else; the console had the same facts spread across
// tiles and fields, where "quantity: 50000" is a value rather than a warning
// that somebody probably misspoke.
//
// PURE: takes records, returns a list. No React, no formatting decisions beyond
// the sentence itself, so the wording can be tested and stays identical on both
// clients.
//
// ORDER IS THE POINT. These are sorted by how much they would change what the
// caller says, not by severity in the abstract — support outranks everything,
// because a sales call into a complaint is worse than a slightly wrong price.
// A gap is stated as the QUESTION TO ASK ("Ask before quoting freight"), never
// left blank: a blank field reads as "nothing to see", and the whole reason
// these exist is that the missing thing is the important thing.

/** @typedef {{ key: string, tone: "danger"|"warning"|"info"|"success", text: string }} Advisory */

/**
 * Advisories for a website / IndiaMART / direct enquiry.
 *
 * @param enquiry  the enquiry record
 * @param ctx.rfq        parsed quote-calculator payload, or null
 * @param ctx.products   the catalogue, for the rate-mismatch check
 * @param ctx.related    quotations already raised for this customer
 * @returns {Advisory[]}
 */
export function enquiryAdvisories(enquiry, { rfq = null, products = [], related = [] } = {}) {
  if (!enquiry) return []
  const out = []

  const age = enquiryAge(enquiry)
  if (age.overdue) {
    out.push({
      key: "stale",
      tone: "warning",
      text: `This enquiry has been sitting as new for ${age.days} days. A same-week reply is most of why an enquiry converts at all.`,
    })
  }

  const artwork = rfqArtwork(enquiry)
  if (artwork?.failed) {
    out.push({
      key: "artwork",
      tone: "danger",
      text: `Their artwork (${artwork.fileName}) failed to upload. Ask them to resend it before promising a mockup.`,
    })
  }

  // The website stamps the rate it showed the customer into the payload. We
  // price from our own catalogue instead (an anonymous insert could forge a
  // rate), so a drift between the two is a conversation to have before a figure
  // is committed to — not silently resolved in our favour.
  const mismatches = rfq ? rfqRateMismatches(rfq.items, products) : []
  if (mismatches.length > 0) {
    out.push({
      key: "rates",
      tone: "warning",
      text:
        mismatches.length === 1
          ? `The rate submitted for ${mismatches[0].name} does not match the catalogue. Prices come from the catalogue on the quotation, so check it before you commit to a figure.`
          : `${mismatches.length} items were submitted at rates that no longer match the catalogue. The quotation uses catalogue rates, so quote from those, not from what they saw.`,
    })
  }

  if (related.length > 0) {
    out.push({
      key: "quoted",
      tone: "info",
      text: `This customer already has ${related.length} quotation${related.length === 1 ? "" : "s"}. Check it before writing another.`,
    })
  }

  return out
}

/**
 * Advisories for a folded voice call with Anu.
 *
 * @param call        a call from groupIntoCalls(), carrying `flags` and `itemsList`
 * @param ctx.related quotations already raised for this caller
 * @returns {Advisory[]}
 */
export function voiceCallAdvisories(call, { related = [] } = {}) {
  if (!call) return []
  const out = []
  const flags = call.flags || {}
  const items = call.itemsList || []

  // Support outranks every other advisory: a sales follow-up into a complaint
  // reads as tone deaf no matter how good the price is.
  if (flags.support) {
    out.push({
      key: "support",
      tone: "danger",
      text: "This call mentions a complaint or a cancellation. Handle it as support before any sales follow-up. A quotation here will read as tone deaf.",
    })
  }

  if (!call.named) {
    out.push({
      key: "unnamed",
      tone: "info",
      text: "Anu never captured a name. Open with the number and the requirement instead, and get the name early.",
    })
  }

  if (flags.urgent) {
    out.push({
      key: "urgent",
      tone: "warning",
      text: `They said it is urgent${call.timeline ? ` (${call.timeline})` : ""}. Ring before you quote. A fast answer is worth more than a polished one here.`,
    })
  }

  if (flags.hugeQty) {
    // A spoken "fifty thousand" is as often a slip as an order.
    const biggest = Math.max(0, ...items.map((i) => Number(String(i.quantity ?? "").replace(/[^\d.]/g, "")) || 0))
    out.push({
      key: "hugeQty",
      tone: "warning",
      text: `The quantity on this call is unusually large${biggest ? ` (up to ${formatNumber(biggest)})` : ""}. Confirm it before it is used for pricing. Spoken figures like this are often a slip of the tongue.`,
    })
  }

  if (flags.incomplete) {
    out.push({
      key: "incomplete",
      tone: "warning",
      text: items.length
        ? "One or more items have no quantity. Confirm them before quoting. A line without a quantity cannot be priced."
        : "Anu never captured what they want. Start the callback by establishing the item and the quantity.",
    })
  }

  // Stated as a gap with the question attached, rather than an empty field.
  if (!call.customer?.address) {
    out.push({
      key: "noAddress",
      tone: "warning",
      text: "Delivery city not captured. Ask for it before quoting freight.",
    })
  }

  if (call.callTotal > 1) {
    out.push({
      key: "repeat",
      tone: "success",
      text: `This customer has called ${call.callTotal} times. Repeat callers convert far better than first-time ones, so treat this as a warm lead.`,
    })
  }

  if (related.length > 0) {
    out.push({
      key: "quoted",
      tone: "info",
      text: `Already quoted ${related.length} time${related.length === 1 ? "" : "s"}. Check that before writing another.`,
    })
  }

  return out
}
