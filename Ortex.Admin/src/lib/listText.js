// Plain-text list editing for terms and conditions and notes.
//
// A line-for-line port of Ortex.Mobile/src/domain/listText.ts, so a clause typed
// on the phone and one typed here behave (and print) the same. Edit both sides.
//
// The text stays PLAIN on purpose: a quotation's terms print on the phone's PDF
// and on the console's DocumentSheet as the same characters, so "1. " and "• "
// are just text there, with no markup to render. These functions give the
// editor list behaviour on top of that text:
//
//   · toggle numbering or bullets on the lines under the cursor/selection;
//   · Enter on a list line continues the list; Enter on an EMPTY item leaves it;
//   · numbered runs renumber themselves, so deleting clause 2 of 4 leaves 1-3;
//   · "+ clause" appends the next numbered clause.
//
// Every edit returns `{ text, cursor }`: the new text and where the caret goes
// (-1 = leave the caret where the browser put it).

const NUMBERED = /^(\s*)(\d+)[.)]\s+/
const BULLETED = /^(\s*)[•*-]\s+/
export const BULLET = "• "

function lines(text) {
  const out = []
  let start = 0
  for (const t of text.split("\n")) {
    out.push({ start, end: start + t.length, text: t })
    start += t.length + 1
  }
  return out
}

const isNumbered = (l) => NUMBERED.test(l)
const isBulleted = (l) => BULLETED.test(l) && !NUMBERED.test(l)
const stripMarker = (l) => l.replace(NUMBERED, "$1").replace(BULLETED, "$1")

/** Is the line containing `at` a numbered / bulleted item? Lights the toolbar. */
export function lineKind(text, at) {
  const start = text.lastIndexOf("\n", Math.max(0, at - 1)) + 1
  const end = text.indexOf("\n", at)
  const line = text.slice(start, end === -1 ? text.length : end)
  if (NUMBERED.test(line)) return "numbered"
  if (BULLETED.test(line)) return "bulleted"
  return null
}

/** Lines touched by the range [start, end]. */
function touched(all, start, end) {
  const idx = []
  all.forEach((l, i) => {
    if (l.end >= start && l.start <= end) idx.push(i)
  })
  return idx.length ? idx : [all.length - 1]
}

/**
 * Consecutive numbered lines are one list and count up from the first line's
 * own number, so a list deliberately started at 5 stays at 5.
 */
export function renumber(text) {
  const out = text.split("\n")
  let next = null
  for (let i = 0; i < out.length; i++) {
    const m = NUMBERED.exec(out[i])
    if (!m) {
      next = null
      continue
    }
    const n = next ?? Number(m[2])
    out[i] = out[i].replace(NUMBERED, `${m[1]}${n}. `)
    next = n + 1
  }
  return out.join("\n")
}

function rebuild(all, replaced, cursorLine) {
  const texts = all.map((l, i) => replaced.get(i) ?? l.text)
  const text = renumber(texts.join("\n"))
  // Cursor at the end of the last touched line, measured in the renumbered text.
  const cursor = text.split("\n").slice(0, cursorLine + 1).join("\n").length
  return { text, cursor }
}

/** Number the lines under the selection, or un-number them if all already are. */
export function toggleNumbered(text, start, end) {
  const all = lines(text)
  const idx = touched(all, start, end)
  const allNumbered = idx.every((i) => isNumbered(all[i].text))
  const replaced = new Map()
  for (const i of idx) {
    const bare = stripMarker(all[i].text)
    replaced.set(i, allNumbered ? bare : bare.replace(/^(\s*)/, "$11. "))
  }
  return rebuild(all, replaced, idx[idx.length - 1])
}

/** Bullet the lines under the selection, or un-bullet them if all already are. */
export function toggleBullets(text, start, end) {
  const all = lines(text)
  const idx = touched(all, start, end)
  const allBulleted = idx.every((i) => isBulleted(all[i].text))
  const replaced = new Map()
  for (const i of idx) {
    const bare = stripMarker(all[i].text)
    replaced.set(i, allBulleted ? bare : bare.replace(/^(\s*)/, `$1${BULLET}`))
  }
  return rebuild(all, replaced, idx[idx.length - 1])
}

/** Add the next numbered clause on a new line at the end. */
export function appendClause(text) {
  let last = 0
  for (const l of lines(text)) {
    const m = NUMBERED.exec(l.text)
    if (m) last = Number(m[2])
  }
  const lead = text.length === 0 ? "" : text.endsWith("\n") ? "" : "\n"
  const next = `${text}${lead}${last + 1}. `
  return { text: next, cursor: next.length }
}

/**
 * React to a change. If it was a single newline typed at the end of (or inside)
 * a list line, continue the list; if that line was an empty item, end the list
 * instead. Anything else only renumbers. Returns null when the text should be
 * taken exactly as typed.
 */
export function afterChange(prev, next) {
  if (next.length === prev.length + 1) {
    let i = 0
    while (i < prev.length && prev[i] === next[i]) i++
    // Inside a run of newlines the new one is ambiguous (Enter at the end of
    // "1. a" before "2. b" looks like a newline typed on the empty line after
    // it). The keystroke came at the end of the text line, so take the run's start.
    if (next[i] === "\n") while (i > 0 && next[i - 1] === "\n") i--
    if (next[i] === "\n") {
      const before = next.slice(0, i)
      const lineStart = before.lastIndexOf("\n") + 1
      const line = before.slice(lineStart)
      const num = NUMBERED.exec(line)
      const bul = !num ? BULLETED.exec(line) : null
      const marker = num ? num[0] : bul ? bul[0] : null
      if (marker !== null) {
        if (line.trim() === marker.trim()) {
          // Enter on "3. " with nothing after it: leave the list. The marker
          // goes, and so does the newline just typed.
          const text = renumber(next.slice(0, lineStart) + next.slice(i + 1))
          return { text, cursor: lineStart }
        }
        const indent = (num ?? bul)[1]
        const insert = num ? `${indent}${Number(num[2]) + 1}. ` : `${indent}${BULLET}`
        const joined = next.slice(0, i + 1) + insert + next.slice(i + 1)
        const text = renumber(joined)
        return { text, cursor: i + 1 + insert.length + (text.length - joined.length) }
      }
    }
  }
  const renumbered = renumber(next)
  return renumbered === next ? null : { text: renumbered, cursor: -1 }
}
