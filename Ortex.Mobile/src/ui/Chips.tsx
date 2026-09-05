import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/store/ThemeContext';
import { palette } from '@/theme/theme';
import { font } from '@/theme/typography';
import type { Priority } from '@/types';
import Icon, { type IconName } from '@/ui/Icon';

export const PRIORITIES: { key: Priority; label: string; color: string }[] = [
  { key: 'none', label: 'None', color: palette.text4 },
  { key: 'low', label: 'Low', color: palette.success100 },
  { key: 'medium', label: 'Medium', color: palette.warning100 },
  { key: 'high', label: 'High', color: palette.error100 },
];

export const priorityMeta = (priority: Priority) =>
  PRIORITIES.find((p) => p.key === priority) ?? PRIORITIES[0];

type ChipProps = {
  label: string;
  icon?: IconName;
  tint?: string;
  active?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  small?: boolean;
};

/** Pill used for tags, priority and reminders — matches the Forget-it chip style. */
export function Chip({
  label,
  icon,
  tint,
  active,
  onPress,
  onRemove,
  small,
}: ChipProps) {
  const t = useTheme();
  const color = tint ?? t.accent;
  const bg = active ? `${color}22` : t.dark ? 'rgba(255,255,255,0.06)' : t.searchBg;
  const border = active ? color : 'transparent';

  const content = (
    <View
      style={[
        styles.chip,
        small && styles.chipSmall,
        { backgroundColor: bg, borderColor: border },
      ]}
    >
      {icon && (
        <View style={styles.chipIcon}>
          <Icon
            name={icon}
            size={small ? 12 : 14}
            color={active ? color : t.textSecondary}
            variant={active ? 'Bold' : 'Linear'}
          />
        </View>
      )}
      <Text
        numberOfLines={1}
        style={[
          styles.chipLabel,
          small && styles.chipLabelSmall,
          { color: active ? color : t.textSecondary },
        ]}
      >
        {label}
      </Text>
      {onRemove && (
        <Pressable
          hitSlop={8}
          onPress={onRemove}
          style={styles.chipRemove}
          accessibilityLabel={`Remove ${label}`}
        >
          <Icon name="close" size={13} color={t.textTertiary} />
        </Pressable>
      )}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
      {content}
    </Pressable>
  );
}

/** Small coloured flag shown on note cards. */
export function PriorityFlag({ priority, size = 14 }: { priority: Priority; size?: number }) {
  if (priority === 'none') return null;
  return <Icon name="flag" size={size} color={priorityMeta(priority).color} variant="Bold" />;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 6,
  },
  chipIcon: {
    marginRight: 5,
  },
  chipLabel: {
    fontSize: 13,
    fontFamily: font.medium,
    maxWidth: 190,
  },
  chipLabelSmall: {
    fontSize: 11,
  },
  chipRemove: {
    marginLeft: 6,
  },
});
