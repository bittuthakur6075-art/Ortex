import { useState, useEffect } from "react"
import PageHeader, { ActionBar } from "../components/layout/PageHeader"
import { Button, SearchInput, PageLoader, Tabs } from "../components/ui/Ui"
import { Plus, Eye, AlertTriangle } from "../components/ui/Icons"
import { useAutomationData } from "./automation/useAutomationData"
import { useWhatsAppDispatch } from "./automation/useWhatsAppDispatch"
import { useRuleEditor } from "./automation/useRuleEditor"
import { useTemplateEditor } from "./automation/useTemplateEditor"
import ActivityLogsTab from "./automation/ActivityLogsTab"
import EventLogsTab from "./automation/EventLogsTab"
import WhatsAppTab from "./automation/WhatsAppTab"
import AiMessagesTab from "./automation/AiMessagesTab"
import RulesTab from "./automation/RulesTab"
import TemplatesTab from "./automation/TemplatesTab"
import TimelineTab from "./automation/TimelineTab"
import RuleEditorDrawer from "./automation/RuleEditorDrawer"
import TemplateEditorDrawer from "./automation/TemplateEditorDrawer"

// A viewer over the tables the marketing site's tracker writes (activities,
// event logs, WhatsApp queue, suggested messages) plus the rules and
// templates that drive the queue. The period-scoped analytics over the same
// data live on the Growth tab of the Insights hub.
const TABS = [
  { value: "activities", label: "User activity" },
  { value: "events", label: "Event logs" },
  { value: "whatsapp", label: "WhatsApp & queue" },
  { value: "ai", label: "Suggested messages" },
  { value: "rules", label: "Automation rules" },
  { value: "templates", label: "Message templates" },
  { value: "timeline", label: "Customer timeline" },
]

const SEARCHABLE = ["activities", "events", "whatsapp", "ai"]

export default function Automation({ embedded = false }) {
  const Header = embedded ? ActionBar : PageHeader
  const [activeTab, setActiveTab] = useState("activities")

  const [searchQuery, setSearchQuery] = useState("")
  const [maskSensitiveData, setMaskSensitiveData] = useState(true)

  // Current page of each paginated log table.
  const [activityPage, setActivityPage] = useState(1)
  const [eventPage, setEventPage] = useState(1)

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
    totals,
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
    handleDeleteRule,
  } = useRuleEditor(templates)

  const {
    templateDrawerOpen,
    setTemplateDrawerOpen,
    editingTemplate,
    templateForm,
    setTemplateForm,
    handleOpenTemplateDrawer,
    handleSaveTemplate,
    handleDeleteTemplate,
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
    <div className="space-y-5">
      <Header
        title="Web events"
        subtitle="Visitor activity, event logs, the WhatsApp queue and the rules and templates that feed it"
      >
        <Button variant="outline" size="sm" onClick={() => setMaskSensitiveData(!maskSensitiveData)}>
          <Eye className="h-4 w-4" />
          {maskSensitiveData ? "Reveal PII" : "Mask PII"}
        </Button>
        {activeTab === "rules" && (
          <Button size="sm" onClick={() => handleOpenRuleDrawer()}>
            <Plus className="h-4 w-4" />
            New rule
          </Button>
        )}
        {activeTab === "templates" && (
          <Button size="sm" onClick={() => handleOpenTemplateDrawer()}>
            <Plus className="h-4 w-4" />
            New template
          </Button>
        )}
      </Header>

      {/* The one diagnostic worth surfacing: a table the console could not read
          (RLS denial, network) silently empties the tabs below. */}
      {loadErrors.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning-text" />
          <span>
            Could not read <strong className="text-foreground">{loadErrors.join(", ")}</strong>. Figures on this page exclude those tables.
          </span>
        </div>
      )}

      <Tabs
        items={TABS}
        value={activeTab}
        onChange={(v) => {
          setActiveTab(v)
          setSearchQuery("")
        }}
      />

      {SEARCHABLE.includes(activeTab) && (
        <SearchInput className="max-w-md" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search logs" />
      )}

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

      {activeTab === "events" && (
        <EventLogsTab
          events={events}
          totals={totals}
          eventTruncated={eventTruncated}
          page={eventPage}
          onPage={setEventPage}
        />
      )}

      {activeTab === "whatsapp" && (
        <WhatsAppTab
          whatsappLogs={whatsappLogs}
          searchQuery={searchQuery}
          maskSensitiveData={maskSensitiveData}
          onOpenWhatsApp={handleOpenWhatsApp}
        />
      )}

      {activeTab === "ai" && <AiMessagesTab aiMessages={aiMessages} />}

      {activeTab === "rules" && (
        <RulesTab
          rules={rules}
          templateNameFor={templateNameFor}
          onEdit={handleOpenRuleDrawer}
          onDelete={handleDeleteRule}
        />
      )}

      {activeTab === "templates" && (
        <TemplatesTab
          templates={templates}
          onEdit={handleOpenTemplateDrawer}
          onDelete={handleDeleteTemplate}
        />
      )}

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

      <RuleEditorDrawer
        open={ruleDrawerOpen}
        onClose={() => setRuleDrawerOpen(false)}
        editingRule={editingRule}
        ruleForm={ruleForm}
        setRuleForm={setRuleForm}
        onSubmit={handleSaveRule}
        templates={templates}
      />

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
