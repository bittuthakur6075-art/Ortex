import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { type LeaveBalance, type LeaveRequest, type LeaveStatus } from "@/domain/attendance"
import { leaveDatesWords } from "@/features/leave/leaveFormat"
import {
  DATE_BADGE,
  dayUnit,
  daysFigure,
  leaveTone,
  SHORT_STATUS,
  STATUS_TONE,
} from "@/features/leave/leaveLook"
import { useTheme } from "@/store/ThemeContext"
import type { StatusTone } from "@/theme/theme"
import { gutter, radius, size as sizes, spacing, state } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { AnimatedPressable, usePressMotion } from "@/ui/motion"
import Skeleton from "@/ui/Skeleton"

// The leave screens' shared components. Their colours and glyphs come from
// leaveLook.ts, so every screen draws a leave type the same way.

// ---- status ------------------------------------------------------------------------------

/** Pending / Approved / Rejected / Cancelled on its tone's tinted well. */
export function LeaveStatusPill({ status }: { status: LeaveStatus }) {
  const t = useTheme()
  const c = t.tones[STATUS_TONE[status]]
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[textVariants.chipText, { color: c.fg }]}>{SHORT_STATUS[status].toUpperCase()}</Text>
    </View>
  )
}

// ---- small marks -------------------------------------------------------------------------

/** The round, tinted well that names a leave type by its code ("CL"), as the attendance legend does. */
export function TypeWell({ code, size = 38 }: { code: string; size?: number }) {
  const t = useTheme()
  const c = t.tones[leaveTone(code)]
  return (
    <View style={[styles.well, { width: size, height: size, backgroundColor: c.bg }]}>
      <Text style={[styles.wellCode, { color: c.fg, fontSize: Math.round(size * 0.32) }]}>{code}</Text>
    </View>
  )
}

export function TypeDot({ code }: { code: string }) {
  const t = useTheme()
  return <View style={[styles.dot, { backgroundColor: t.tones[leaveTone(code)].fg }]} />
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]


/**
 * The compact calendar leaf on a request or holiday row: month, date, weekday,
 * tinted in the leave type's colour (or neutral for a holiday).
 */
export function DateBadge({ day, code, tone }: { day: string; code?: string; tone?: StatusTone }) {
  const t = useTheme()
  const c = t.tones[tone ?? (code ? leaveTone(code) : "slate")]
  const d = new Date(`${day}T00:00:00Z`)
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]} accessible={false}>
      <Text style={[textVariants.badgeText, { color: c.fg }]}>{MONTHS[d.getUTCMonth()]}</Text>
      <Text style={[styles.badgeDate, { color: c.fg }]}>{d.getUTCDate()}</Text>
      <Text style={[textVariants.microLabel, { color: c.fg }]}>{WEEKDAYS[d.getUTCDay()]}</Text>
    </View>
  )
}

// ---- balance tile ------------------------------------------------------------------------


/**
 * One leave type's balance as a compact pill (the Attendance page's month
 * pills): the code, what is AVAILABLE, and anything pending in the warning ink.
 * Tapping opens that type's ledger, the history that makes the figure.
 */
export function BalanceTile({ b, onPress }: { b: LeaveBalance; onPress?: () => void }) {
  const t = useTheme()
  const press = usePressMotion({ scale: 0.97, dim: state.pressedOpacity })
  const unpaid = b.accrual === "none"
  const c = t.tones[leaveTone(b.code)]
  const label = unpaid
    ? `${b.name}, unpaid, loss of pay`
    : `${b.name}, ${daysFigure(b.available)} ${dayUnit(b.available)} available${b.pending ? `, ${daysFigure(b.pending)} pending` : ""}`
  const body = (
    <>
      <View style={[styles.code, { backgroundColor: c.bg }]}>
        <Text style={[styles.codeText, { color: c.fg }]}>{b.code}</Text>
      </View>
      {unpaid ? (
        <Text style={[styles.pillText, { color: t.textSecondary }]}>Unpaid</Text>
      ) : (
        <Text style={[styles.pillValue, { color: b.available > 0 ? t.text : t.textTertiary }]}>
          {daysFigure(b.available)}
          <Text style={[styles.pillText, { color: t.textSecondary }]}>{` ${b.name}`}</Text>
        </Text>
      )}
      {b.pending ? (
        <Text style={[styles.pillText, { color: t.warningText }]}>{`· ${daysFigure(b.pending)} pending`}</Text>
      ) : null}
    </>
  )
  if (!onPress) {
    return (
      <View style={[styles.tile, { backgroundColor: t.surfaceInset }]} accessible accessibilityLabel={label}>
        {body}
      </View>
    )
  }
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Opens the history`}
      style={[styles.tile, { backgroundColor: t.surfaceInset }, press.style]}
    >
      {body}
    </AnimatedPressable>
  )
}

export function BalanceTileSkeleton({ width = 132 }: { width?: number }) {
  return <Skeleton width={width} height={38} radius={19} />
}

// ---- request row -------------------------------------------------------------------------

/**
 * A leave request in a list: its date leaf, the type with its colour dot, the
 * dates in words, and on the right the day count over the status chip.
 */
export function LeaveRow({ r, typeName, onPress }: { r: LeaveRequest; typeName: string; onPress?: () => void }) {
  const t = useTheme()
  const press = usePressMotion({ scale: 0.985, dim: state.pressedOpacity })
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${typeName}, ${leaveDatesWords(r)}, ${daysFigure(r.days)} ${dayUnit(r.days)}, ${SHORT_STATUS[r.status]}`}
      style={[styles.row, press.style]}
    >
      <DateBadge day={r.from_day} code={r.type_code} />
      <View style={styles.rowBody}>
        <View style={styles.typeLine}>
          <TypeDot code={r.type_code} />
          <Text numberOfLines={1} style={[textVariants.listTitle, { color: t.text, flexShrink: 1 }]}>
            {typeName}
          </Text>
        </View>
        <Text numberOfLines={2} style={[textVariants.listSubtitle, { color: t.textTertiary, marginTop: 4 }]}>
          {leaveDatesWords(r)}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[textVariants.listAmount, { color: r.status === "cancelled" || r.status === "rejected" ? t.textTertiary : t.text }]}>
          {daysFigure(r.days)}
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>{` ${dayUnit(r.days)}`}</Text>
        </Text>
        <LeaveStatusPill status={r.status} />
      </View>
    </AnimatedPressable>
  )
}

/** `LeaveRow`'s geometry as a placeholder; keep the two in step. */
export function LeaveRowSkeleton({ index = 0 }: { index?: number }) {
  const widths = ["58%", "46%", "64%"] as const
  const subs = ["72%", "54%", "66%"] as const
  return (
    <View style={styles.row}>
      <Skeleton width={DATE_BADGE.width} height={DATE_BADGE.height} radius={radius.card} />
      <View style={styles.rowBody}>
        <Skeleton width={widths[index % 3]} height={15} radius={7} />
        <Skeleton width={subs[index % 3]} height={12} radius={6} style={{ marginTop: 8 }} />
      </View>
      <View style={styles.rowRight}>
        <Skeleton width={52} height={18} radius={7} />
        <Skeleton width={64} height={18} radius={9} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  well: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badge: {
    width: DATE_BADGE.width,
    height: DATE_BADGE.height,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeDate: { fontFamily: font.bold, fontSize: 19, lineHeight: 22, fontVariant: ["tabular-nums"] },
  wellCode: { fontFamily: font.semibold, letterSpacing: 0.2 },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 6,
  },
  code: { minWidth: 32, height: 26, borderRadius: 13, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  codeText: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.2 },
  pillValue: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20, fontVariant: ["tabular-nums"] },
  pillText: { fontFamily: font.medium, fontSize: 12.5, lineHeight: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: gutter,
    paddingVertical: spacing.md,
    minHeight: sizes.touchMin,
  },
  rowBody: { flex: 1, minWidth: 0 },
  typeLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowRight: { alignItems: "flex-end", gap: 6 },
})
