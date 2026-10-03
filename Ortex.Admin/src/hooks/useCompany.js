// The company the console is looking at: { companies, current, set, canAll,
// multi, scope, defaultCompany, on, all, nameOf }. State lives in
// data/store/company.js (the stores stamp new rows from it). AdminLayout runs
// useCompanySync() once to feed it the signed-in profile and the companies
// table; every other component just reads it with useCompany().

import { useEffect, useSyncExternalStore } from "react"
import { repo } from "../data/store/repository"
import { companyName, companyState } from "../data/store/company"

/** Re-read the companies table (after the Super Admin saves one). */
export async function reloadCompanies() {
  const all = await repo.listCompanies().catch(() => null)
  if (all) companyState.setAll(all)
  return all || []
}

export function useCompany() {
  const view = useSyncExternalStore(companyState.subscribe, companyState.get)
  return { ...view, set: companyState.set, nameOf: companyName }
}

/** Once, in the shell: the profile from useProfile(), re-read when it or its companies change. */
export function useCompanySync(profile) {
  const key = profile ? `${profile.id || "local"}:${(profile.companies || []).join(",")}` : ""
  useEffect(() => {
    if (!profile) return undefined
    let alive = true
    companyState.attach(profile, companyState.get().all)
    repo
      .listCompanies()
      .then((all) => alive && companyState.attach(profile, all))
      .catch(() => {})
    return () => {
      alive = false
    }
    // key covers the parts of the profile that matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => {
    if (profile) companyState.attach(profile, companyState.get().all)
  }, [profile])
}
