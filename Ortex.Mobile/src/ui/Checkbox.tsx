import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/store/ThemeContext';
import { font } from '@/theme/typography';
import Icon from '@/ui/Icon';

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
};

/**
 * Tick-circle checkbox matching the checklist rows on note cards. Usage:
 * `<Checkbox checked={item.done} onChange={(v) => toggle(item.id, v)} label={item.text} />`
 */
function Checkbox({ checked, onChange, label, disabled }: Props) {
  const t = useTheme();

  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      style={[styles.row, { opacity: disabled ? 0.45 : 1 }]}
    >
      <Icon
        name="tick"
        size={22}
        color={checked ? t.accent : t.textTertiary}
        variant={checked ? 'Bold' : 'Linear'}
      />
      {!!label && (
        <Text
          style={[
            styles.label,
            {
              color: checked ? t.textTertiary : t.text,
              textDecorationLine: checked ? 'line-through' : 'none',
            },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export default memo(Checkbox);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    marginLeft: 10,
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: font.regular,
  },
});
