// The business facts the website states in more than one place, kept once.
//
// Before this file, the About stats, the FAQ's GST / dispatch / MOQ answers and
// Anu's voice brief (components/ui/live-orty/prompt.js) each carried their own
// hand-typed copy, and Anu's product range was typed twice more (the prompt's
// "WHAT ORTEX MAKES" and catalogue.js's STANDARD_RANGE). A changed fact now
// changes here and reaches every one of them, including what Anu says aloud.
// Contact details stay in constants/site.js, which the prompt also reads.

/** The four figures on the About page, also quoted by Anu. */
export const STATS = [
  { value: "10+", label: "Years crafting custom products", spoken: "10+ years in business" },
  { value: "5L+", label: "Products delivered to date", spoken: "over 5 lakh products delivered" },
  { value: "1,200+", label: "Brands and businesses served", spoken: "1,200+ brands served" },
  { value: "98%", label: "Orders dispatched on time", spoken: "98% of orders dispatched on time" },
]

export const TERMS = {
  gstStandard: 18,
  gstReduced: 12,
  gstReducedItems: "lanyards, flags, and caps",
  dispatchMinDays: 4,
  dispatchMaxDays: 12,
  quoteTurnaround: "one working day",
}

/**
 * Where each minimum order quantity starts, as the FAQ states it. Kept beside
 * PRODUCT_RANGE so the two are read together: a changed minimum is changed in
 * both, in this one file.
 */
export const MOQ_TIERS = [
  { from: 10, items: "wall clocks" },
  { from: 25, items: "acrylic paperweights, examination boards and corporate gifts" },
  { from: 50, items: "keychains, badges, clipboards and MDF products" },
  { from: 100, items: "lanyards and fridge magnets" },
  { from: 200, items: "moulded silicone, PVC and satin items" },
]

/**
 * The everyday range Ortex makes, with its minimums. Anu's brief lists it as
 * "WHAT ORTEX MAKES", and catalogue.js answers from it for a product the
 * console has not been filled in with yet. `kind` must be a key of KINDS in
 * catalogue.js; `line` is how the brief states it.
 */
export const PRODUCT_RANGE = [
  { kind: "keychain", name: "Custom keychains", moq: "50 to 200 depending on the material", materials: "acrylic, leather, metal, wooden, silicone, soft PVC and satin", note: "any custom shape with the logo",
    line: "Keychains: acrylic, leather, metal, wooden, silicone, soft PVC and satin, in custom shapes with the logo. Minimum 50 to 200 depending on material." },
  { kind: "standee", name: "Acrylic desk standees and name holders", moq: "25 to 50", materials: "acrylic", note: "also paperweights and dashboard idols",
    line: "Acrylic products: desk standees, name and card holders, paperweights, photo frames, dashboard idols. Minimum 25 to 50." },
  { kind: "trophy", name: "Trophies and awards", moq: "50 to 100 in MDF, 25 to 50 in acrylic", materials: "MDF and acrylic", note: "custom shapes and engraved titles",
    line: "MDF products: award trophies, examination pads, custom-shape fridge magnets. Minimum 50 to 100." },
  { kind: "lanyard", name: "Lanyards and ID card holders", moq: "100", materials: "full-colour sublimation polyester and satin, with acrylic or PVC ID card holders", note: "hooks, clips and safety breakaways to choice",
    line: "Lanyards and ID: full-colour sublimation and satin lanyards, and ID card holders. Minimum 100." },
  { kind: "badge", name: "Badges", moq: "50 to 200", materials: "metal name badges with magnet, plastic pin badges, button badges and LED badges", note: "",
    line: "Badges: metal name badges with magnet, plastic pin badges, button badges, LED badges. Minimum 50 to 200." },
  { kind: "clock", name: "Promotional wall clocks", moq: "10 to 25", materials: "round, square, designer, wooden and acrylic", note: "",
    line: "Wall clocks: promotional round and square, designer, wooden and acrylic. Minimum 10 to 25." },
  { kind: "board", name: "Examination boards and clipboards", moq: "25 to 50", materials: "MDF and acrylic", note: "for schools and institutions",
    line: "Examination boards and clipboards for schools and institutions. Minimum 25 to 50." },
  { kind: "magnet", name: "Fridge magnets", moq: "100 to 200", materials: "MDF, acrylic, PVC and wood", note: "custom shapes",
    line: "Fridge magnets in MDF, acrylic, PVC and wood. Minimum 100 to 200." },
  { kind: "stationery", name: "Diary and pen sets", moq: "25", materials: "paper and board with metal pens", note: "often paired into a gift set",
    line: "Corporate gifting: diary and pen sets. Minimum 25." },
  { kind: "drinkware", name: "Insulated steel bottles, mugs and tumblers", moq: "25", materials: "stainless steel", note: "",
    line: "Corporate gifting: insulated steel bottles, mugs and tumblers. Minimum 25." },
  { kind: "giftset", name: "Corporate gift sets", moq: "25", materials: "bottles, diaries, pens and keychains combined", note: "one quotation, one dispatch",
    line: "Corporate gift sets combining bottles, diaries, pens and keychains. Minimum 25." },
  { kind: "frame", name: "Photo frames", moq: "25 to 50", materials: "acrylic and MDF", note: "",
    line: "Photo frames in acrylic and MDF. Minimum 25 to 50." },
  { kind: "apparel", name: "Promotional merchandise", moq: "confirmed by the team for apparel", materials: "caps, T-shirts, wristbands, popsockets and epoxy dome stickers", note: "",
    line: "Promotional merchandise such as caps, T-shirts, wristbands, popsockets and epoxy dome stickers." },
  { kind: "signage", name: "Flags and banners", moq: "confirmed by the team", materials: "fabric and vinyl", note: "",
    line: "Flags and banners." },
]

// ---- sentences shared by the FAQ and Anu -------------------------------------

export const gstSentence = () =>
  `Most products are billed at ${TERMS.gstStandard}% GST, while ${TERMS.gstReducedItems} are billed at ${TERMS.gstReduced}%.`

export const dispatchSentence = () =>
  `Most orders dispatch in about ${TERMS.dispatchMinDays} to ${TERMS.dispatchMaxDays} working days, depending on the product, quantity, and finish.`

export const moqSentence = () =>
  MOQ_TIERS.map((t, i) => `${i === MOQ_TIERS.length - 1 ? "and " : ""}${t.items} start at ${t.from}${i === 0 ? " units" : ""}`).join("; ")

const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]

/** "+91-9211947188" as Anu should say it: "nine two one one nine, four seven one eight eight". */
export function spokenPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "").slice(-10)
  const words = [...d].map((c) => DIGIT_WORDS[Number(c)])
  return `${words.slice(0, 5).join(" ")}, ${words.slice(5).join(" ")}`
}

/** "sales@ortexindustries.in" as Anu should say it. */
export const spokenEmail = (email) => String(email || "").replace("@", " at ").replace(/\./g, " dot ")
