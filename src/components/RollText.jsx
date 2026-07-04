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
          <span className="roll-char" key={i} style={{ "--i": i }}>
            {ch === " " ? "\u00A0" : ch}
          </span>
        ))}
      </span>
    </>
  )
}
