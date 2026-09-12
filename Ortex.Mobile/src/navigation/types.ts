import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs"
import type { CompositeScreenProps } from "@react-navigation/native"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"

import type { Customer, Line } from "@/domain/schema"
import type { LegalDocKey } from "@/features/profile/legal"

export type TabParamList = {
  Quotes: undefined
  Leads: undefined
  Products: undefined
  Contacts: undefined
}

/** What a "create a quotation" entry point can hand the editor. */
export type QuotationPrefill = {
  customer?: Partial<Customer>
  lines?: Line[]
  notes?: string
  enquiryId?: string
}

export type RootStackParamList = {
  Tabs: undefined
  QuotationEditor: { id?: string; prefill?: QuotationPrefill } | undefined
  QuotationDetail: { id: string }
  CustomerDetail: { id: string }
  EnquiryDetail: { id: string }
  VoiceCallDetail: { id: string }
  ContactEditor: { prefill?: Partial<Customer> } | undefined
  ProductDetail: { id: string }
  // presetCategory is how CategoryEditor hands back the category somebody just
  // created (navigate with merge: true), since a callback cannot be a param.
  ProductEditor: { id?: string; presetCategory?: string } | undefined
  CategoryDetail: { id: string }
  // pickFor names the screen waiting on this category, so saving can return the
  // name to it instead of dead-ending on a list the caller never asked for.
  CategoryEditor: { id?: string; pickFor?: "ProductEditor" } | undefined
  WorkDetail: { id: string }
  WorkEditor: { id?: string } | undefined
  Notifications: undefined
  NotificationSettings: undefined
  Search: undefined
  Profile: undefined
  AccountDetails: undefined
  Team: undefined
  ChangePassword: undefined
  Legal: { doc: LegalDocKey }
}

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>

export type StackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>
