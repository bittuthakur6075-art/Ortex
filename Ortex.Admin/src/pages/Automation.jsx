import { useState, useEffect } from "react"
import { useProfile } from "../hooks/useProfile"
import { Button, Input, PageLoader } from "../components/ui/Ui"
import { Search, Plus, Eye } from "../components/ui/Icons"
import { useAutomationData } from "./automation/useAutomationData"
import { useWhatsAppDispatch } from "./automation/useWhatsAppDispatch"
import { useRuleEditor } from "./automation/useRuleEditor"
import { useTemplateEditor } from "./automation/useTemplateEditor"
import AnalyticsTab from "./automation/AnalyticsTab"
import ActivityLogsTab from "./automation/ActivityLogsTab"
import EventLogsTab from "./automation/EventLogsTab"
import WhatsAppTab from "./automation/WhatsAppTab"
import AiMessagesTab from "./automation/AiMessagesTab"
import RulesTab from "./automation/RulesTab"
import TemplatesTab from "./automation/TemplatesTab"
import TimelineTab from "./automation/TimelineTab"
import RuleEditorDrawer from "./automation/RuleEditorDrawer"
import TemplateEditorDrawer from "./automation/TemplateEditorDrawer"

export default function Automation() {
  const [activeTab, setActiveTab] = useState("analytics")

  const [searchQuery, setSearchQuery] = useState("")
  const [maskSensitiveData, setMaskSensitiveData] = useState(true)

  // Current page of each paginated log table.
  const [activityPage, setActivityPage] = useState(1)
  const [eventPage, setEventPage] = useState(1)

  const profile = useProfile()

  const {
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
  } = useAutomationData()

  const { handleOpenWhatsApp } = useWhatsAppDispatch()

  const {
    ruleDrawerOpen,
    setRuleDrawerOpen,
    editingRule,
    ruleForm,
    setRuleForm,
    templateNameFor,
    handleOpenRuleDrawer,
    handleSaveRule,
    handleDeleteRule
  } = useRuleEditor(templates)

  const {
    templateDrawerOpen,
    setTemplateDrawerOpen,
    editingTemplate,
    templateForm,
    setTemplateForm,
    handleOpenTemplateDrawer,
    handleSaveTemplate,
    handleDeleteTemplate
  } = useTemplateEditor()

  // A new search or tab should start at page one, not wherever the last one left off.
  useEffect(() => {
    setActivityPage(1)
    setEventPage(1)
  }, [searchQuery, activeTab])

  const activityTruncated = totals.user_activities !== null && totals.user_activities > activities.length
  const eventTruncated = totals.event_logs !== null && totals.event_logs > events.length

  if (loading) return <PageLoader />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Automation Console</h1>
          <p className="text-sm text-muted-foreground">
            Manage user activity tracking, AI message triggers, and automated WhatsApp Business templates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMaskSensitiveData(!maskSensitiveData)}
            className="text-xs"
          >
            <Eye className="h-4 w-4" />
            {maskSensitiveData ? "Reveal PII Data" : "Mask PII Data"}
          </Button>
          {activeTab === "rules" && (
            <Button size="sm" onClick={() => handleOpenRuleDrawer()}>
              <Plus className="h-4 w-4" />
              New Rule
            </Button>
          )}
          {activeTab === "templates" && (
            <Button size="sm" onClick={() => handleOpenTemplateDrawer()}>
              <Plus className="h-4 w-4" />
              New Template
            </Button>
          )}
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { id: "analytics", label: "Analytics & KPI" },
          { id: "activities", label: "User Activity" },
          { id: "events", label: "Event Logs" },
          { id: "whatsapp", label: "WhatsApp & Queue" },
          { id: "ai", label: "AI Suggested Messages" },
          { id: "rules", label: "Automation Rules" },
          { id: "templates", label: "Message Templates" },
          { id: "timeline", label: "Customer Timeline" }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTab(t.id)
              setSearchQuery("")
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* SEARCH INPUT FOR DATATABLES */}
      {["activities", "events", "whatsapp", "ai"].includes(activeTab) && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="pl-10"
          />
        </div>
      )}

      {/* ---------------- 1. ANALYTICS & DASHBOARD ---------------- */}
      {activeTab === "analytics" && (
        <AnalyticsTab
          activities={activities}
          events={events}
          whatsappLogs={whatsappLogs}
          aiMessages={aiMessages}
          totals={totals}
          activityTruncated={activityTruncated}
          profile={profile}
          loadErrors={loadErrors}
        />
      )}

      {/* ---------------- 2. USER ACTIVITY LOGS ---------------- */}
      {activeTab === "activities" && (
        <ActivityLogsTab
          activities={activities}
          totals={totals}
          activityTruncated={activityTruncated}
          searchQuery={searchQuery}
          maskSensitiveData={maskSensitiveData}
          page={activityPage}
          onPage={setActivityPage}
        />
      )}

      {/* ---------------- 3. EVENT LOGS ---------------- */}
      {activeTab === "events" && (
        <EventLogsTab
          events={events}
          totals={totals}
          eventTruncated={eventTruncated}
          page={eventPage}
          onPage={setEventPage}
        />
      )}

      {/* ---------------- 4. WHATSAPP LOGS & QUEUE MONITOR ---------------- */}
      {activeTab === "whatsapp" && (
        <WhatsAppTab
          whatsappLogs={whatsappLogs}
          searchQuery={searchQuery}
          maskSensitiveData={maskSensitiveData}
          onOpenWhatsApp={handleOpenWhatsApp}
        />
      )}

      {/* ---------------- 5. AI MESSAGE LOGS ---------------- */}
      {activeTab === "ai" && <AiMessagesTab aiMessages={aiMessages} />}

      {/* ---------------- 6. AUTOMATION RULES ---------------- */}
      {activeTab === "rules" && (
        <RulesTab
          rules={rules}
          templateNameFor={templateNameFor}
          onEdit={handleOpenRuleDrawer}
          onDelete={handleDeleteRule}
        />
      )}

      {/* ---------------- 7. MESSAGE TEMPLATES ---------------- */}
      {activeTab === "templates" && (
        <TemplatesTab
          templates={templates}
          onEdit={handleOpenTemplateDrawer}
          onDelete={handleDeleteTemplate}
        />
      )}

      {/* ---------------- 8. CUSTOMER TIMELINE ---------------- */}
      {activeTab === "timeline" && (
        <TimelineTab
          customers={customers}
          selectedCustomerId={selectedCustomerId}
          onSelectCustomer={setSelectedCustomerId}
          maskSensitiveData={maskSensitiveData}
          activities={activities}
          whatsappLogs={whatsappLogs}
          aiMessages={aiMessages}
        />
      )}

      {/* ---------------- RULE DRAWER ---------------- */}
      <RuleEditorDrawer
        open={ruleDrawerOpen}
        onClose={() => setRuleDrawerOpen(false)}
        editingRule={editingRule}
        ruleForm={ruleForm}
        setRuleForm={setRuleForm}
        onSubmit={handleSaveRule}
        templates={templates}
      />

      {/* ---------------- TEMPLATE DRAWER ---------------- */}
      <TemplateEditorDrawer
        open={templateDrawerOpen}
        onClose={() => setTemplateDrawerOpen(false)}
        editingTemplate={editingTemplate}
        templateForm={templateForm}
        setTemplateForm={setTemplateForm}
        onSubmit={handleSaveTemplate}
      />

    </div>
  )
}
