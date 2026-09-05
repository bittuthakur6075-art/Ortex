import { useNavigation } from "@react-navigation/native"
import React from "react"
import { Pressable, View } from "react-native"

import { feedback } from "@/lib/feedback"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { radius, size, state } from "@/theme/tokens"
import Avatar from "@/ui/Avatar"

/**
 * The app-bar avatar — the way into Account details.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\components\ProfileAvatarButton.jsx.
 * The console keeps a top avatar menu holding the profile, the password and
 * sign-out; this is that menu's entry point on the phone, opening the Profile
 * SCREEN rather than a popover — at phone width a popover is a full-height panel
 * pretending to be a menu.
 *
 * It sits in the LEFT slot, and only on tab roots. A pushed screen needs that
 * slot for its back arrow, which is why AppScreen gives `back` precedence over
 * `headerLeft` rather than trying to fit both.
 *
 * No fetch of its own: the signed-in profile already lives in AuthContext, so
 * four tabs mounting this cannot turn into four profile reads.
 */
export default function ProfileAvatarButton({ bordered = false }: { bordered?: boolean }) {
  const t = useTheme()
  const navigation = useNavigation<{ navigate: (screen: string) => void }>()
  const { profile, session } = useAuth()

  const name = profile?.name?.trim() || profile?.email || session?.user?.email || ""

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name ? `Account, ${name}` : "Account"}
      hitSlop={8}
      onPress={() => {
        feedback.tap()
        navigation.navigate("Profile")
      }}
      style={({ pressed }) => ({
        width: size.touchMin,
        height: size.touchMin,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.pill,
        // A content fade, not a pressed wash — the app-wide press treatment.
        opacity: pressed ? state.pressedOpacity : 1,
      })}
    >
      {bordered ? (
        // A flush 2dp surface-coloured edge, for a bar that is not plain white.
        // Off by default: on a white bar a white border is invisible pixels.
        <View style={{ borderWidth: 2, borderColor: t.surface, borderRadius: radius.pill }}>
          <Avatar uri={profile?.avatar_url ?? undefined} name={name} size={36} />
        </View>
      ) : (
        <Avatar uri={profile?.avatar_url ?? undefined} name={name} size={36} />
      )}
    </Pressable>
  )
}
