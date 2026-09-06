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
  ProductEditor: { id?: string } | undefined
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
