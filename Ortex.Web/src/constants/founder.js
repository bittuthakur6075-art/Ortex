/**
 * Founder's note.
 *
 * Left intentionally empty. The <FounderNote /> section renders nothing while
 * `body` is empty, so the homepage stays honest until the founder writes this.
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
  name: "",
  title: "",
  body: "",
  portrait: "",
}

export const hasFounderNote = () =>
  Boolean(founderNote.body?.trim() && founderNote.name?.trim())
