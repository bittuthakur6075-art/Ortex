import React from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { useTheme } from '@/store/ThemeContext';
import Icon, { type IconName, type IconVariant } from '@/ui/Icon';

type Props = {
  name: IconName;
  onPress: () => void;
  size?: number;
  color?: string;
  variant?: IconVariant;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export default function IconButton({
  name,
  onPress,
  size = 22,
  color,
  variant,
  disabled,
  style,
  accessibilityLabel,
}: Props) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: t.ripple, borderless: true, radius: 22 }}
      style={({ pressed }) => [
        styles.button,
        style,
        { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={name} size={size} color={color ?? t.text} variant={variant} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
