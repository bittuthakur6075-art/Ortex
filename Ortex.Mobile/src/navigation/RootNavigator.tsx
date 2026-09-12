import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native"
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from "@react-navigation/native-stack"
import React from "react"

import AccountUnavailableView from "@/features/auth/AccountUnavailableView"
import LockScreen from "@/features/auth/LockScreen"
import SplashView from "@/features/auth/SplashView"
import LoginScreen from "@/features/auth/LoginScreen"
import { useAppLock } from "@/features/auth/useAppLock"
import ContactEditorScreen from "@/features/contacts/ContactEditorScreen"
import CustomerDetailScreen from "@/features/contacts/CustomerDetailScreen"
import EnquiryDetailScreen from "@/features/leads/EnquiryDetailScreen"
import VoiceCallDetailScreen from "@/features/leads/VoiceCallDetailScreen"
import ProductDetailScreen from "@/features/products/ProductDetailScreen"
import CategoryDetailScreen from "@/features/products/CategoryDetailScreen"
import CategoryEditorScreen from "@/features/products/CategoryEditorScreen"
import WorkDetailScreen from "@/features/work/WorkDetailScreen"
import WorkEditorScreen from "@/features/work/WorkEditorScreen"
import ProductEditorScreen from "@/features/products/ProductEditorScreen"
import AccountDetailsScreen from "@/features/profile/AccountDetailsScreen"
import ChangePasswordScreen from "@/features/profile/ChangePasswordScreen"
import LegalScreen from "@/features/profile/LegalScreen"
import ProfileScreen from "@/features/profile/ProfileScreen"
import TeamScreen from "@/features/profile/TeamScreen"
import NotificationSettingsScreen from "@/features/notifications/NotificationSettingsScreen"
import NotificationsScreen from "@/features/notifications/NotificationsScreen"
import { NotificationEngine } from "@/features/notifications/useNotificationEngine"
import GlobalSearchScreen from "@/features/search/GlobalSearchScreen"
import QuotationDetailScreen from "@/features/quotations/QuotationDetailScreen"
import QuotationEditorScreen from "@/features/quotations/QuotationEditorScreen"
import { flushPendingNavigation, navigationRef } from "@/navigation/navigationRef"
import Tabs from "@/navigation/Tabs"
import { hasAnyTab } from "@/navigation/tabAccess"
import type { RootStackParamList } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useIsDark, useTheme } from "@/store/ThemeContext"

const Stack = createNativeStackNavigator<RootStackParamList>()

/** The Profile hub's inner pages: a near-full bottom sheet with a grabber. */
const SHEET: NativeStackNavigationOptions = {
  presentation: "formSheet",
  sheetAllowedDetents: [0.94],
  sheetCornerRadius: 28,
  sheetGrabberVisible: true,
  // A sheet slides up; the stack's shared parallax push would fight it.
  animation: "slide_from_bottom",
}

export default function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const t = useTheme()
  const isDark = useIsDark()
  const { session, profile, profileError, ready, biometricEnabled, biometricReady } = useAuth()
  // Both readiness flags: the lock arms once, and arming it before the stored
  // preference has been read would arm it as "off" on every launch.
  const { locked, prompting, unlock } = useAppLock(biometricEnabled && !!session, ready && biometricReady)

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: t.background,
      card: t.appBar,
      text: t.text,
      primary: t.primary,
      border: t.divider,
    },
  }

  // Hold the splash until BOTH the session and the fonts have resolved.
  // Rendering earlier flashes the login screen at an already-signed-in user, or
  // paints the whole app in the system face and then reflows it.
  if (!ready || !fontsReady) return <SplashView />

  if (!session) return <LoginScreen />

  if (locked) return <LockScreen prompting={prompting} onUnlock={() => void unlock()} />

  // The session exists but the profile row has not arrived yet. Everything
  // downstream reads `profile.modules` to decide which tabs exist, so rendering
  // now would briefly show a tabless shell. If it FAILED to arrive and there is
  // no saved copy either, say so rather than spin forever.
  if (!profile) {
    return profileError ? <AccountUnavailableView reason="offline" /> : <SplashView message="Loading your account" />
  }
  // A profile that reaches no tab at all would hand the tab navigator zero
  // screens, which React Navigation refuses with a throw, not a blank page.
  if (!hasAnyTab(profile)) return <AccountUnavailableView reason="no-modules" />

  return (
    <NavigationContainer theme={navTheme} ref={navigationRef} onReady={flushPendingNavigation}>
      {/* Renders nothing: it watches the same collections the screens do, posts
          what is new to the notification shade and turns a tap there back into a
          screen. Inside the container so it can navigate. */}
      <NotificationEngine />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          // One UI pushes with a parallax slide: the outgoing screen drifts and
          // dims while the incoming one slides over it.
          animation: "ios_from_right",
          animationDuration: 320,
          gestureEnabled: true,
          contentStyle: { backgroundColor: t.background },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="QuotationEditor" component={QuotationEditorScreen} />
        <Stack.Screen name="QuotationDetail" component={QuotationDetailScreen} />
        <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
        <Stack.Screen name="EnquiryDetail" component={EnquiryDetailScreen} />
        <Stack.Screen name="VoiceCallDetail" component={VoiceCallDetailScreen} />
        <Stack.Screen name="ContactEditor" component={ContactEditorScreen} />
        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
        <Stack.Screen name="ProductEditor" component={ProductEditorScreen} />
        <Stack.Screen name="CategoryDetail" component={CategoryDetailScreen} />
        <Stack.Screen name="CategoryEditor" component={CategoryEditorScreen} />
        <Stack.Screen name="WorkDetail" component={WorkDetailScreen} />
        <Stack.Screen name="WorkEditor" component={WorkEditorScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={SHEET} />
        <Stack.Screen name="Search" component={GlobalSearchScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        {/* The Profile hub's inner pages come up as SHEETS, not pushes. Each is a
            short errand off a settings menu — read a fact, flip a switch, sign a
            password change — and a sheet says "you are still on Profile, this
            closes" where a full push says "you have gone somewhere". `formSheet`
            is a real bottom sheet on Android too since react-native-screens 4;
            the grabber and the near-full detent come from there, not from a
            hand-rolled panel. */}
        <Stack.Screen name="AccountDetails" component={AccountDetailsScreen} options={SHEET} />
        <Stack.Screen name="Team" component={TeamScreen} options={SHEET} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={SHEET} />
        <Stack.Screen name="Legal" component={LegalScreen} options={SHEET} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
