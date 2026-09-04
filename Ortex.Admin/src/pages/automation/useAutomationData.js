import { useState, useEffect } from "react"
import { toast } from "sonner"
import { repo } from "../../data/store/repository"
import { LOG_WINDOW } from "./helpers"

// Loads every collection the console reads, tracks which ones failed, and
// re-runs on store updates.
export function useAutomationData() {
  const [loading, setLoading] = useState(true)

  // Collections state
  const [activities, setActivities] = useState([])
  const [events, setEvents] = useState([])
  const [whatsappLogs, setWhatsappLogs] = useState([])
  const [aiMessages, setAiMessages] = useState([])
  const [rules, setRules] = useState([])
  const [templates, setTemplates] = useState([])
  const [customers, setCustomers] = useState([])

  // Selection state for timeline
  const [selectedCustomerId, setSelectedCustomerId] = useState("")

  // Collections that failed to load (RLS denial, network) — fed to diagnostics.
  const [loadErrors, setLoadErrors] = useState([])

  // True row counts, so we can tell the user when the loaded window is partial.
  const [totals, setTotals] = useState({ user_activities: null, event_logs: null })

  // Load all required collections on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)

        // Record which collections we couldn't read instead of swallowing the
        // error. An RLS denial used to fall back to [], rendering as "No
        // activities found" — indistinguishable from a table that is simply
        // empty. Security Diagnostics reports whatever lands in `failures`.
        const failures = []
        const safeList = (name, opts) =>
          repo.list(name, opts).catch((err) => {
            console.error(`Failed to load ${name}:`, err)
            failures.push(name)
            return []
          })
        const safeCount = (name) => repo.count(name).catch(() => null)

        const [actList, evtList, waList, aiList, ruleList, tmplList, custList, actTotal, evtTotal] = await Promise.all([
          safeList("user_activities", { limit: LOG_WINDOW }),
          safeList("event_logs", { limit: LOG_WINDOW }),
          safeList("whatsapp_logs"),
          safeList("ai_messages"),
          safeList("automation_rules"),
          safeList("message_templates"),
          safeList("customers"),
          safeCount("user_activities"),
          safeCount("event_logs")
        ])

        setLoadErrors(failures)
        setTotals({ user_activities: actTotal, event_logs: evtTotal })
        setActivities(actList)
        setEvents(evtList)
        setWhatsappLogs(waList)
        setAiMessages(aiList)
        setRules(ruleList)
        setTemplates(tmplList)
        setCustomers(custList)

        if (custList.length > 0) {
          // Pre-select first customer for timeline
          setSelectedCustomerId(custList[0].id || "")
        }
      } catch (err) {
        toast.error("Failed to load automation records: " + err.message)
      } finally {
        setLoading(false)
      }
    }
    loadData()

    // Subscribe to store updates
    const unsubscribe = repo.subscribe(() => {
      loadData()
    })
    return () => unsubscribe()
  }, [])

  return {
    loading,
    activities,
    events,
    whatsappLogs,
    aiMessages,
    rules,
    templates,
    customers,
    selectedCustomerId,
    setSelectedCustomerId,
    loadErrors,
    totals
  }
}
