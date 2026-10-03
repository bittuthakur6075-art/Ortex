import AsyncStorage from "@react-native-async-storage/async-storage"
import React from "react"

import { repo } from "@/data/repo"
import {
  canSeeAllCompanies,
  companiesOf,
  companyScope,
  inCompanies,
  pickCompany,
  type Company,
  type CompanyChoice,
  type Profile,
} from "@/domain/modules"

// The company the lists show (Admin migrations 0075 and 0076).
//
// "all" or one company id, saved per user on the handset. The default is the
// person's first company (the database's default_company_id()); "all" only for
// admins with more than one. Someone in one company never sees a switcher, a
// chip or a Company row, and a database without companies (before 0075) has an
// empty list: nothing is filtered and nothing changes.
//
// The provider takes the profile as a prop (App.tsx) so this module never
// imports AuthContext, which clears the saved choice on sign-out.

const KEY = "@ortex/company"

export type CompanyValue = {
  /** The companies this person works in, their default first. */
  companies: Company[]
  /** "all", one company id, or "" when the database has no companies. */
  choice: CompanyChoice
  setChoice: (choice: CompanyChoice) => void
  /** More than one company: the switcher, chips and Company rows appear. */
  multi: boolean
  /** May pick "All companies". */
  canAll: boolean
  /** The ids lists keep, or null for everything. */
  scope: string[] | null
  /** The company a new record goes to unless the person picks: the current one, "" in All mode. */
  defaultCompany: string
  nameOf: (id?: string | null) => string
}

const nameIn = (companies: Company[]) => (id?: string | null) =>
  (id && companies.find((c) => c.id === id)?.name) || ""

const EMPTY: CompanyValue = {
  companies: [],
  choice: "",
  setChoice: () => {},
  multi: false,
  canAll: false,
  scope: null,
  defaultCompany: "",
  nameOf: () => "",
}

// The same value for code outside React (Anu's tools, the chat Anu engine).
let current: CompanyValue = EMPTY

/** The current company choice for non-React callers. */
export const companyNow = () => current

/**
 * Which company's records an answer covers, in words, for Anu: "" for someone in
 * one company, so nothing changes for them.
 */
export function companyNote(value: CompanyValue = current): string {
  if (!value.multi) return ""
  if (value.choice === "all") return `Across all your companies (${value.companies.map((c) => c.name).join(", ")}).`
  return value.nameOf(value.choice) ? `For ${value.nameOf(value.choice)}.` : ""
}

/** The rows of a company table in the current choice, for code outside React. */
export function inCurrentCompanies<T>(rows: T[]): T[] {
  return inCompanies(rows, current.scope)
}

/** Sign-out: forget the saved choice so the next person starts at their own default. */
export function clearCompanyChoice() {
  current = EMPTY
  AsyncStorage.removeItem(KEY).catch(() => {})
}

const CompanyContext = React.createContext<CompanyValue>(EMPTY)

export function CompanyProvider({
  profile,
  userId,
  children,
}: {
  profile: Profile | null
  userId: string | undefined
  children: React.ReactNode
}) {
  const [all, setAll] = React.useState<Company[]>([])
  const [saved, setSaved] = React.useState<string | null>(null)
  // A changed company list follows the profile (the Super Admin edits both).
  const companiesKey = profile?.companies?.join(",")

  React.useEffect(() => {
    if (!userId) {
      setAll([])
      setSaved(null)
      return
    }
    let alive = true
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const parsed = raw ? (JSON.parse(raw) as { userId?: string; choice?: string }) : null
        if (alive && parsed?.userId === userId) setSaved(parsed.choice ?? null)
      })
      .catch(() => {})
    repo
      .listCompanies()
      .then((list) => {
        if (alive) setAll(list)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [userId, companiesKey])

  const setChoice = React.useCallback(
    (choice: CompanyChoice) => {
      setSaved(choice)
      if (userId) AsyncStorage.setItem(KEY, JSON.stringify({ userId, choice })).catch(() => {})
    },
    [userId],
  )

  const value = React.useMemo<CompanyValue>(() => {
    const companies = companiesOf(profile, all)
    const choice = pickCompany(saved, profile, companies)
    return {
      companies,
      choice,
      setChoice,
      multi: companies.length > 1,
      canAll: canSeeAllCompanies(profile, companies),
      scope: companyScope(choice, companies),
      defaultCompany: choice === "all" ? "" : choice,
      nameOf: nameIn(all),
    }
  }, [profile, all, saved, setChoice])

  React.useEffect(() => {
    current = value
  }, [value])
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}

export const useCompany = () => React.useContext(CompanyContext)
