import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/store/ThemeContext';

type Props = {
  inset?: number;
};

/**
 * Hairline divider. Usage: `<Divider inset={16} />`
 */
function Divider({ inset = 0 }: Props) {
  const t = useTheme();
  return (
    <View
      style={[styles.line, { backgroundColor: t.divider, marginLeft: inset }]}
    />
  );
}

export default memo(Divider);

const styles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
  },
});
