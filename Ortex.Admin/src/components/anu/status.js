// What Anu is doing, in the words and moods the panel, the pill and the face share.

export const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

export function moodOf(session) {
  if (session.status === "connecting") return "connecting"
  if (session.status === "error") return "error"
  if (session.status !== "live") return "idle"
  if (session.speaking) return "speaking"
  if (session.thinking) return "thinking"
  return "listening"
}

export function statusText(session) {
  switch (session.status) {
    case "connecting": return "Connecting"
    case "live":
      if (session.speaking) return "Speaking"
      if (session.thinking) return "Looking it up"
      return session.muted ? "Muted" : "Listening"
    case "ended": return "Conversation ended"
    case "error": return "Could not connect"
    default: return "Team assistant"
  }
}
