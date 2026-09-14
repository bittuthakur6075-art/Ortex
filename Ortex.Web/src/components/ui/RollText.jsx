/**
 * RollText — per-character rolling text animation on hover.
 * Each character slides upward independently with a staggered delay,
 * revealing the duplicated text in its text-shadow.
 * Ported from the Keystone design system.
 */
export default function RollText({ text }) {
  return (
    <>
      <span className="roll-sr">{text}</span>
      <span className="roll-text" aria-hidden="true">
        {Array.from(text).map((ch, i) => (
          // The glyph is drawn by CSS (::before reads data-ch), not written as
          // text: a crawler reads a link's text from the DOM, and spelling the
          // label out again here made every footer link's anchor text read
          // "Our workOur work".
          <span className="roll-char" key={i} style={{ "--i": i }} data-ch={ch === " " ? "\u00A0" : ch} />
        ))}
      </span>
    </>
  )
}
