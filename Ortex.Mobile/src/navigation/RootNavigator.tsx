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
import QuotationDefaultsScreen from "@/features/profile/QuotationDefaultsScreen"
import TeamScreen from "@/features/profile/TeamScreen"
import UserDetailScreen from "@/features/profile/UserDetailScreen"
import WhatsNewScreen from "@/features/profile/WhatsNewScreen"
import NotificationSettingsScreen from "@/features/notifications/NotificationSettingsScreen"
import NotificationsScreen from "@/features/notifications/NotificationsScreen"
import { NotificationEngine } from "@/features/notifications/useNotificationEngine"
import GlobalSearchScreen from "@/features/search/GlobalSearchScreen"
import AnuScreen from "@/features/anu/AnuScreen"
import AttendanceApprovalsScreen from "@/features/attendance/AttendanceApprovalsScreen"
import {
  AttendanceApprovalAlerts,
  AttendanceQueueSync,
  AttendanceReminderPlanner,
} from "@/features/attendance/AttendanceBackground"
import AttendanceClockScreen from "@/features/attendance/AttendanceClockScreen"
import AttendanceCorrectionScreen from "@/features/attendance/AttendanceCorrectionScreen"
import AttendanceDayScreen from "@/features/attendance/AttendanceDayScreen"
import AttendanceHistoryScreen from "@/features/attendance/AttendanceHistoryScreen"
import AttendanceNoticeScreen from "@/features/attendance/AttendanceNoticeScreen"
import AttendanceScreen from "@/features/attendance/AttendanceScreen"
import LeaveApplyScreen from "@/features/leave/LeaveApplyScreen"
import LeaveLedgerScreen from "@/features/leave/LeaveLedgerScreen"
import LeaveRequestScreen from "@/features/leave/LeaveRequestScreen"
import LeaveScreen from "@/features/leave/LeaveScreen"
import InsightsScreen from "@/features/home/InsightsScreen"
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
  const { locked, prompting, error: lockError, method: lockMethod, unlock } = useAppLock(biometricEnabled && !!session, ready && biometricReady)

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

  if (locked) {
    return <LockScreen prompting={prompting} error={lockError} method={lockMethod} onUnlock={() => void unlock()} />
  }

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
      {/* Attendance's background work: offline clock-ins, reminders, approval
          alerts. Also render nothing, and live only while someone is signed in. */}
      <AttendanceQueueSync />
      <AttendanceReminderPlanner />
      <AttendanceApprovalAlerts />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          // One UI pushes with a parallax slide: the incoming page slides over
          // while the outgoing one drifts a quarter of the way behind it. On
          // Android the curve and timing live in res/anim/rns_ios_from_right_*
          // (420ms open on a long deceleration, 360ms close), which override the
          // library's 200ms defaults; this duration is iOS's, kept to match.
          animation: "ios_from_right",
          animationDuration: 420,
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
        {/* Anu takes the whole screen and rises from the bottom, like a call. */}
        <Stack.Screen
          name="Anu"
          component={AnuScreen}
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom", gestureEnabled: false }}
        />
        <Stack.Screen name="Insights" component={InsightsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        {/* The Profile hub's inner pages come up as SHEETS, not pushes. Each is a
            short errand off a settings menu — read a fact, flip a switch, sign a
            password change — and a sheet says "you are still on Profile, this
            closes" where a full push says "you have gone somewhere". `formSheet`
            is a real bottom sheet on Android too since react-native-screens 4;
            the grabber and the near-full detent come from there, not from a
            hand-rolled panel. */}
        <Stack.Screen name="AccountDetails" component={AccountDetailsScreen} options={SHEET} />
        {/* Team and a user's page are the exception: a searchable roster and a
            record with a timeline are places you work in, not errands, so they
            are full-screen pushes. */}
        <Stack.Screen name="Team" component={TeamScreen} />
        <Stack.Screen name="UserDetail" component={UserDetailScreen} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={SHEET} />
        {/* A full page, not a sheet: three long text fields and a keyboard need
            the whole screen. */}
        <Stack.Screen name="QuotationDefaults" component={QuotationDefaultsScreen} />
        <Stack.Screen name="Legal" component={LegalScreen} options={SHEET} />
        {/* A page you read down, several releases long: a push, not a sheet. */}
        <Stack.Screen name="WhatsNew" component={WhatsNewScreen} />
        {/* Attendance. Clocking in rises from the bottom and takes the whole
            screen (camera, then result), like Anu; the rest are pushes. */}
        <Stack.Screen name="Attendance" component={AttendanceScreen} />
        <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} />
        <Stack.Screen name="AttendanceDay" component={AttendanceDayScreen} />
        <Stack.Screen name="AttendanceCorrection" component={AttendanceCorrectionScreen} />
        <Stack.Screen name="AttendanceApprovals" component={AttendanceApprovalsScreen} />
        {/* Leave: pages you work in, so pushes. */}
        <Stack.Screen name="Leave" component={LeaveScreen} />
        <Stack.Screen name="LeaveApply" component={LeaveApplyScreen} />
        <Stack.Screen name="LeaveRequest" component={LeaveRequestScreen} />
        <Stack.Screen name="LeaveLedger" component={LeaveLedgerScreen} />
        <Stack.Screen
          name="AttendanceNotice"
          component={AttendanceNoticeScreen}
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="AttendanceClock"
          component={AttendanceClockScreen}
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom", gestureEnabled: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
