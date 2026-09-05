import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import React from "react"

import { canAccess, type ModuleKey } from "@/domain/modules"
import ContactsScreen from "@/features/contacts/ContactsScreen"
import LeadsScreen from "@/features/leads/LeadsScreen"
import ProductsScreen from "@/features/products/ProductsScreen"
import QuotationsScreen from "@/features/quotations/QuotationsScreen"
import OneUiTabBar from "@/navigation/OneUiTabBar"
import type { TabParamList } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"

const Tab = createBottomTabNavigator<TabParamList>()

// A tab is rendered only if the signed-in profile can reach the module behind
// it, using the console's own `canAccess`. A Sales Executive is granted
// voice-leads / enquiries / customers / quotations by default, so Products
// simply is not there for them — rather than being there and erroring on open.
//
// Leads needs either of its two modules, matching the console's HubGuard.
const REQUIRES: Record<keyof TabParamList, ModuleKey[]> = {
  Quotes: ["quotations"],
  Leads: ["enquiries", "voice-leads"],
  Products: ["products"],
  Contacts: ["customers"],
}

export default function Tabs() {
  const { profile } = useAuth()
  const allowed = (name: keyof TabParamList) => REQUIRES[name].some((k) => canAccess(profile, k))

  return (
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
      {allowed("Quotes") && (
        <Tab.Screen name="Quotes" component={QuotationsScreen} options={{ title: "Quotes" }} />
      )}
      {allowed("Leads") && <Tab.Screen name="Leads" component={LeadsScreen} options={{ title: "Leads" }} />}
      {allowed("Products") && (
        <Tab.Screen name="Products" component={ProductsScreen} options={{ title: "Products" }} />
      )}
      {allowed("Contacts") && (
        <Tab.Screen name="Contacts" component={ContactsScreen} options={{ title: "Contacts" }} />
      )}
    </Tab.Navigator>
  )
}
