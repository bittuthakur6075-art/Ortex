import { canAccess, type ModuleKey, type Profile } from "@/domain/modules"
import type { TabParamList } from "@/navigation/types"

// A tab is rendered only if the signed-in profile can reach the module behind
// it, using the console's own `canAccess`. A Sales Executive is granted
// voice-leads / enquiries / customers / quotations by default, so Products
// simply is not there for them — rather than being there and erroring on open.
//
// Leads needs either of its two modules, matching the console's HubGuard.
export const TAB_REQUIRES: Record<keyof TabParamList, ModuleKey[]> = {
  Quotes: ["quotations"],
  Leads: ["enquiries", "voice-leads"],
  Products: ["products"],
  Contacts: ["customers"],
}

const TAB_NAMES = Object.keys(TAB_REQUIRES) as (keyof TabParamList)[]

export function tabAllowed(profile: Profile | null, name: keyof TabParamList): boolean {
  return TAB_REQUIRES[name].some((k) => canAccess(profile, k))
}

/** Does this profile reach at least one tab? RootNavigator refuses to mount an empty navigator. */
export function hasAnyTab(profile: Profile | null): boolean {
  return TAB_NAMES.some((name) => tabAllowed(profile, name))
}
