import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs"
import type { CompositeScreenProps } from "@react-navigation/native"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"

import type { RangeKey } from "@/domain/dashboard"
import type { Customer, Line } from "@/domain/schema"
import type { InsightSection } from "@/features/home/InsightsScreen"
import type { LegalDocKey } from "@/features/profile/legal"

export type TabParamList = {
  Home: undefined
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
  // The team's voice assistant; `ask` starts the call with that question.
  Anu: { ask?: string } | undefined
  // Home's deeper analysis: opened on Home's period, scrolled to a section.
  Insights: { range?: RangeKey; section?: InsightSection } | undefined
  Profile: undefined
  AccountDetails: undefined
  Team: undefined
  UserDetail: { id: string }
  ChangePassword: undefined
  // The rep's own payment terms, T&C and notes for new quotations.
  QuotationDefaults: undefined
  Legal: { doc: LegalDocKey }
  WhatsNew: undefined
  // Attendance (docs/pm/ATTENDANCE_LEAVE_PLAN.md): marked only here, on the phone.
  Attendance: undefined
  AttendanceNotice: { kind: "in" | "out" }
  AttendanceClock: { kind: "in" | "out" }
  AttendanceHistory: undefined
  AttendanceDay: { day: string }
  /** Ask for a correction of one day: the times, pre-filled from what is known. */
  AttendanceCorrection: { day: string; inAt?: string | null; outAt?: string | null }
  /** Admins: corrections and flagged punches waiting for a decision. */
  AttendanceApprovals: undefined
  // Leave (phase 3, migration 0036).
  Leave: undefined
  /** Optionally pre-selects a leave type. */
  LeaveApply: { type?: string } | undefined
  LeaveRequest: { id: string }
  /** One leave type's balance history; `name` is the title, when known. */
  LeaveLedger: { code: string; name?: string }
}

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>

export type StackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>
