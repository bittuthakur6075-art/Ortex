import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import React from "react"

import LockScreen from "@/features/auth/LockScreen"
import LoginScreen from "@/features/auth/LoginScreen"
import { useAppLock } from "@/features/auth/useAppLock"
import CustomerDetailScreen from "@/features/contacts/CustomerDetailScreen"
import ProfileScreen from "@/features/profile/ProfileScreen"
import QuotationDetailScreen from "@/features/quotations/QuotationDetailScreen"
import QuotationEditorScreen from "@/features/quotations/QuotationEditorScreen"
import Tabs from "@/navigation/Tabs"
import type { RootStackParamList } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { AppLoader } from "@/ui"

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const t = useTheme()
  const { session, profile, ready, biometricEnabled } = useAuth()
  const { locked, prompting, unlock } = useAppLock(biometricEnabled && !!session, ready)

  const navTheme = {
    ...(t.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(t.dark ? DarkTheme : DefaultTheme).colors,
      background: t.bg,
      card: t.headerBg,
      text: t.text,
      primary: t.accent,
      border: t.divider,
    },
  }

  // Hold the splash until BOTH the session and the fonts have resolved.
  // Rendering earlier flashes the login screen at an already-signed-in user, or
  // paints the whole app in the system face and then reflows it.
  if (!ready || !fontsReady) return <AppLoader />

  if (!session) return <LoginScreen />

  if (locked) return <LockScreen prompting={prompting} onUnlock={() => void unlock()} />

  // The session exists but the profile row has not arrived yet. Everything
  // downstream reads `profile.modules` to decide which tabs exist, so rendering
  // now would briefly show a tabless shell.
  if (!profile) return <AppLoader label="Loading your account" />

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          // One UI pushes with a parallax slide: the outgoing screen drifts and
          // dims while the incoming one slides over it.
          animation: "ios_from_right",
          animationDuration: 320,
          gestureEnabled: true,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="QuotationEditor" component={QuotationEditorScreen} />
        <Stack.Screen name="QuotationDetail" component={QuotationDetailScreen} />
        <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
