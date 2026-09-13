import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { BlurTargetView } from "expo-blur"
import React from "react"

import ContactsScreen from "@/features/contacts/ContactsScreen"
import HomeScreen from "@/features/home/HomeScreen"
import LeadsScreen from "@/features/leads/LeadsScreen"
import ProductsScreen from "@/features/products/ProductsScreen"
import QuotationsScreen from "@/features/quotations/QuotationsScreen"
import { blurTargetRef } from "@/navigation/blurTarget"
import OneUiTabBar from "@/navigation/OneUiTabBar"
import { tabAllowed } from "@/navigation/tabAccess"
import type { TabParamList } from "@/navigation/types"
import { StyleSheet } from "react-native"

import { useAuth } from "@/store/AuthContext"

const Tab = createBottomTabNavigator<TabParamList>()

// Which tab needs which module lives in navigation/tabAccess.ts, shared with
// RootNavigator, which refuses to mount this navigator with no tabs at all.
export default function Tabs() {
  const { profile } = useAuth()
  const allowed = (name: keyof TabParamList) => tabAllowed(profile, name)

  return (
    // Android's blur backend blurs whatever is drawn inside this target view — it
    // must wrap everything that should show through the glass capsule. The tab bar
    // points its BlurView at the same ref.
    <BlurTargetView ref={blurTargetRef} style={styles.fill}>
      <Tab.Navigator
        tabBar={(props) => <OneUiTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          // Cross-fade with a slight shift between tabs, the way One UI moves.
          animation: "shift",
          transitionSpec: {
            animation: "spring",
            config: { damping: 22, stiffness: 220, mass: 0.9 },
          },
        }}
      >
        {/* First, so it is where the app opens: the day's work before any list. */}
        {allowed("Home") && <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Home" }} />}
        {allowed("Quotes") && (
          <Tab.Screen name="Quotes" component={QuotationsScreen} options={{ title: "Quotes" }} />
        )}
        {allowed("Leads") && <Tab.Screen name="Leads" component={LeadsScreen} options={{ title: "Leads" }} />}
        {allowed("Products") && (
          <Tab.Screen name="Products" component={ProductsScreen} options={{ title: "Catalogue" }} />
        )}
        {allowed("Contacts") && (
          <Tab.Screen name="Contacts" component={ContactsScreen} options={{ title: "Customers" }} />
        )}
      </Tab.Navigator>
    </BlurTargetView>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
