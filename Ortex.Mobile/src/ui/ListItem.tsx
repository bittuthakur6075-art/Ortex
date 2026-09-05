import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/store/ThemeContext';
import { font } from '@/theme/typography';
import Icon, { type IconName } from '@/ui/Icon';

type Props = {
  title: string;
  subtitle?: string;
  leadingIcon?: IconName;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  trailingText?: string;
  showChevron?: boolean;
  onPress?: () => void;
  divider?: boolean;
  disabled?: boolean;
};

/**
 * Settings-style row. Usage:
 * `<ListItem leadingIcon="folder" title="Folders" subtitle="3 folders" onPress={openFolders} />`
 */
function ListItem({
  title,
  subtitle,
  leadingIcon,
  leading,
  trailing,
  trailingText,
  showChevron = true,
  onPress,
  divider,
  disabled,
}: Props) {
  const t = useTheme();

  const inner = (
    <View style={[styles.row, { opacity: disabled ? 0.45 : 1 }]}>
      {(leading || leadingIcon) && (
        <View style={styles.leading}>
          {leading ?? <Icon name={leadingIcon!} size={20} color={t.textSecondary} />}
        </View>
      )}
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.title, { color: t.text }]}>
          {title}
        </Text>
        {!!subtitle && (
          <Text numberOfLines={2} style={[styles.subtitle, { color: t.textTertiary }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {!!trailingText && (
        <Text style={[styles.trailingText, { color: t.textTertiary }]}>{trailingText}</Text>
      )}
      {trailing}
      {!trailing && showChevron && onPress && (
        <Icon name="forward" size={18} color={t.textTertiary} />
      )}
    </View>
  );

  return (
    <View>
      {onPress ? (
        <Pressable
          onPress={onPress}
          disabled={disabled}
          android_ripple={{ color: t.ripple }}
          accessibilityRole="button"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {inner}
        </Pressable>
      ) : (
        inner
      )}
      {divider && <View style={[styles.divider, { backgroundColor: t.divider }]} />}
    </View>
  );
}

export default memo(ListItem);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  leading: {
    marginRight: 14,
    width: 22,
    alignItems: 'center',
  },
  text: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 15.5,
    fontFamily: font.medium,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: font.regular,
  },
  trailingText: {
    fontSize: 13,
    fontFamily: font.medium,
    marginRight: 6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
});
