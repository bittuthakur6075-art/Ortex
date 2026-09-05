import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { palette } from "@/theme/theme"
import { font } from "@/theme/typography"
import { Button, Icon } from "@/ui"

/** Shown instead of the app while the biometric lock is engaged. */
export default function LockScreen({ prompting, onUnlock }: { prompting: boolean; onUnlock: () => void }) {
  return (
    <View style={styles.root}>
      <View style={styles.badge}>
        <Icon name="fingerprint" size={40} color={palette.white} variant="Linear" />
      </View>
      <Text style={styles.title}>Ortex Sales is locked</Text>
      <Text style={styles.hint}>
        {prompting ? "Waiting for your fingerprint…" : "Unlock to see your quotes and contacts."}
      </Text>
      <View style={styles.action}>
        <Button label="Unlock" onPress={onUnlock} variant="secondary" icon="lock" disabled={prompting} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: palette.primary,
  },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  title: {
    marginTop: 22,
    fontSize: 21,
    color: palette.white,
    fontFamily: font.bold,
  },
  hint: {
    marginTop: 8,
    fontSize: 14,
    textAlign: "center",
    color: palette.primary20,
    fontFamily: font.regular,
  },
  action: {
    marginTop: 28,
  },
})
