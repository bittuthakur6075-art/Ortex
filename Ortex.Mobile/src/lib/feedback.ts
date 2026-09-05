import * as Haptics from "expo-haptics"

// The single haptics layer. Screens call `feedback.created()`, never
// `Haptics.notificationAsync` directly, so the vocabulary stays consistent and
// the user's on/off preference is honoured in exactly one place.
//
// Every call is fire-and-forget and every failure is swallowed: a device with no
// vibration motor, or a platform that rejects the call, must never break the
// action the user actually asked for.
//
// The project this kit came from paired each of these with a sound effect. That
// is dropped here deliberately — a sales app that chirps in front of a customer
// is worse than a silent one.

let enabled = true

export function configureFeedback({ haptics }: { haptics: boolean }) {
  enabled = haptics
}

const impact = (style: Haptics.ImpactFeedbackStyle) => {
  if (!enabled) return
  Haptics.impactAsync(style).catch(() => {})
}

const notify = (type: Haptics.NotificationFeedbackType) => {
  if (!enabled) return
  Haptics.notificationAsync(type).catch(() => {})
}

export const feedback = {
  /** A plain button or row press. */
  tap: () => impact(Haptics.ImpactFeedbackStyle.Light),
  /** Pushing or popping a screen. */
  navigate: () => impact(Haptics.ImpactFeedbackStyle.Light),
  /** Moving between options in a picker, chip rail or segmented control. */
  select: () => {
    if (!enabled) return
    Haptics.selectionAsync().catch(() => {})
  },
  longPress: () => impact(Haptics.ImpactFeedbackStyle.Medium),
  /** A record was saved — a quotation, a customer, a status change. */
  created: () => notify(Haptics.NotificationFeedbackType.Success),
  deleted: () => impact(Haptics.ImpactFeedbackStyle.Heavy),
  toggle: (on: boolean) =>
    impact(on ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light),
  unlocked: () => notify(Haptics.NotificationFeedbackType.Success),
  warn: () => notify(Haptics.NotificationFeedbackType.Warning),
  error: () => notify(Haptics.NotificationFeedbackType.Error),
}
