/**
 * RollText — per-character rolling text animation on hover.
 * Each character slides upward independently with a staggered delay,
 * revealing the duplicated text in its text-shadow.
 * Ported from the Keystone design system.
 *
 * Each WORD is its own one-line clipped box (`.roll-word`), with real spaces
 * between them. A label too long for its column (a console category name in
 * the footer) then wraps between words, and every line still clips its own
 * shadow copy. With one clipped box around the whole label, a wrapped label
 * was two lines tall, so the first line's shadow showed through on the second
 * as a doubled line of text.
 */
export default function RollText({ text }) {
  const words = text.split(" ")
  let n = 0 // running character index, so the stagger flows across words
  return (
    <>
      <span className="roll-sr">{text}</span>
      <span className="roll-text" aria-hidden="true">
        {words.map((word, w) => (
          <span key={w}>
            <span className="roll-word">
              {Array.from(word).map((ch) => {
                const i = n++
                // The glyph is drawn by CSS (::before reads data-ch), not written as
                // text: a crawler reads a link's text from the DOM, and spelling the
                // label out again here made every footer link's anchor text read
                // "Our workOur work".
                return <span className="roll-char" key={i} style={{ "--i": i }} data-ch={ch} />
              })}
            </span>
            {w < words.length - 1 ? " " : null}
          </span>
        ))}
      </span>
    </>
  )
}
