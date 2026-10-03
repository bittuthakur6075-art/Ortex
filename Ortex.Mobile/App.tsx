import { useFonts } from "expo-font"
import React from "react"
import { StatusBar } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"

import { fontAssets } from "@/theme/typography"
import UpdateGate from "@/features/update/UpdateGate"
import RootNavigator from "@/navigation/RootNavigator"
import { AuthProvider, useAuth } from "@/store/AuthContext"
import { CompanyProvider } from "@/store/CompanyContext"
import { ThemeProvider, useIsDark, useTheme } from "@/store/ThemeContext"
import { ToastProvider } from "@/ui"
import ErrorBoundary from "@/ui/ErrorBoundary"

function Root() {
  const t = useTheme()
  const isDark = useIsDark()
  // Addington CF + Inter, the two faces the ramp in theme/typography.ts is built
  // on. A missing entry fails at load rather than silently falling back to the
  // system face (Roboto on Android, which reads visibly wrong against Inter).
  const [fontsLoaded, fontError] = useFonts(fontAssets)

  // Never let the splash gate hang: if the fonts fail or stall, fall through to
  // the system face rather than showing a loader forever.
  const [fontTimedOut, setFontTimedOut] = React.useState(false)
  React.useEffect(() => {
    const timer = setTimeout(() => setFontTimedOut(true), 6000)
    return () => clearTimeout(timer)
  }, [])

  const fontsReady = fontsLoaded || !!fontError || fontTimedOut

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={t.appBar}
        translucent={false}
      />
      {/* Outermost, so a build the office no longer supports cannot reach even
          the sign-in screen (features/update/UpdateGate.tsx). */}
      <UpdateGate>
        {/* Inside the gate, so a crashed screen still lets a required update
            take over (ui/ErrorBoundary.tsx). */}
        <ErrorBoundary>
          <RootNavigator fontsReady={fontsReady} />
        </ErrorBoundary>
      </UpdateGate>
    </>
  )
}

// The company lists show, for the signed-in person (store/CompanyContext.tsx).
function Companies({ children }: { children: React.ReactNode }) {
  const { profile, session } = useAuth()
  return (
    <CompanyProvider profile={profile} userId={session?.user?.id}>
      {children}
    </CompanyProvider>
  )
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <Companies>
              <ToastProvider>
                <Root />
              </ToastProvider>
            </Companies>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
