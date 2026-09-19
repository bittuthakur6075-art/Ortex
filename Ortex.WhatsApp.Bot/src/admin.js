// The console's own analytics, imported from Ortex.Admin so the numbers match
// the Dashboard exactly. Requires the bot to run from inside the repo checkout,
// with register.js loaded (npm scripts do both).
export { computeToday, attentionItems, voiceCalls, partyName, WON, DECIDED, OPEN_QUOTE, DAY } from "../../Ortex.Admin/src/lib/analytics/today.js"
export { invoiceBalance, resolveInvoiceStatus } from "../../Ortex.Admin/src/data/domain/domain.js"
export { formatCurrency } from "../../Ortex.Admin/src/lib/format.js"
export { VOICE_SOURCE } from "../../Ortex.Admin/src/pages/voice-leads/helpers.js"
export {
  buildVisitors, summarise as summariseVisitors, INTEREST, productOf, headline, sourceOf,
} from "../../Ortex.Admin/src/pages/automation/visitors.js"
