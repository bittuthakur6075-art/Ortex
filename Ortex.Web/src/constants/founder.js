/**
 * Founder's note.
 *
 * The <FounderNote /> section renders nothing while `body` is empty. The text
 * below is the owner's approved note, mirrored as FOUNDER in
 * Ortex.Web.Main/src/constants/content.js: change both together.
 *
 * A founder's note only works if it says something a marketer wouldn't: why the
 * business exists, what it refuses to compromise on, what went wrong once. Do
 * not fill this with generated copy — a B2B buyer can smell it, and the section
 * is worth less than nothing if it reads like boilerplate.
 *
 * To publish: set `body` to 4–6 sentences in the founder's own voice, and fill
 * in `name` / `title`. Optionally add `signatureImage` and `portrait`.
 */
export const founderNote = {
  name: "Louis Sharma",
  title: "Owner, Ortex Industries",
  body: "Every order that leaves our floor carries someone else's name, and we never forget that.\n\nWhen a school trusts us with its exam boards, or a hospital with the badges its staff wear every day, we are holding a small piece of their reputation. That is why everything is made in-house, why you see and approve a proof before a single piece is cut, and why every quotation is clear and every order comes with a GST invoice. No surprises in between.\n\nWe are a manufacturer that picks up the phone. If something is not right, tell us and we will make it right. Thank you for considering Ortex Industries. We would love to make something you are proud to hand out.",
  portrait: "",
}

export const hasFounderNote = () =>
  Boolean(founderNote.body?.trim() && founderNote.name?.trim())
