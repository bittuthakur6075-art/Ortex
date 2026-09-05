import React, { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/store/ThemeContext';
import { font } from '@/theme/typography';

type Props = {
  size?: 'small' | 'large';
  color?: string;
  label?: string;
};

/**
 * Themed loading indicator. Usage: `<Spinner label="Loading" />`
 */
function Spinner({ size = 'small', color, label }: Props) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <ActivityIndicator size={size} color={color ?? t.accent} />
      {!!label && <Text style={[styles.label, { color: t.textSecondary }]}>{label}</Text>}
    </View>
  );
}

export default memo(Spinner);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    marginLeft: 10,
    fontSize: 13.5,
    fontFamily: font.medium,
  },
});
