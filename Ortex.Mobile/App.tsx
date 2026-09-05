import {
  useFonts,
  ZalandoSans_300Light,
  ZalandoSans_400Regular,
  ZalandoSans_500Medium,
  ZalandoSans_600SemiBold,
  ZalandoSans_700Bold,
  ZalandoSans_800ExtraBold,
} from "@expo-google-fonts/zalando-sans"
import React from "react"
import { StatusBar } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"

import RootNavigator from "@/navigation/RootNavigator"
import { AuthProvider } from "@/store/AuthContext"
import { ThemeProvider, useTheme } from "@/store/ThemeContext"
import { ToastProvider } from "@/ui"

function Root() {
  const t = useTheme()
  const [fontsLoaded, fontError] = useFonts({
    ZalandoSans_300Light,
    ZalandoSans_400Regular,
    ZalandoSans_500Medium,
    ZalandoSans_600SemiBold,
    ZalandoSans_700Bold,
    ZalandoSans_800ExtraBold,
  })

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
        barStyle={t.dark ? "light-content" : "dark-content"}
        backgroundColor={t.headerBg}
        translucent={false}
      />
      <RootNavigator fontsReady={fontsReady} />
    </>
  )
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <Root />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
