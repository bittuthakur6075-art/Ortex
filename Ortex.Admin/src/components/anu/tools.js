// Anu's staff tools, as Gemini Live function declarations.
//
// A copy of Ortex.Mobile/src/features/anu/tools.ts (edit both sides), with two
// console differences in the descriptions: opening a record or a draft does
// NOT end the call here, because the panel stays docked beside the page it
// opens. READ tools answer from the console's own collections (useAnuSession's
// `runTool`); the two WRITE tools require `confirmed: true`, which the prompt
// only allows after a yes, and the executor refuses without it.

const S = (description) => ({ type: "STRING", description })

export const ANU_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_briefing",
        description:
          "What needs the person's attention today: new website enquiries not yet handled, Anu's customer calls nobody has returned (support complaints flagged), sent quotations expiring within 3 days or already expired, quotations waiting a week for a decision, and the open pipeline value. Use for 'what's pending', 'what should I do today', 'any new leads'.",
      },
      {
        name: "find_customers",
        description:
          "Search customers by name, company, phone number, email or GSTIN. Returns contact details, how many quotations they have, their won value and their last quotation.",
        parameters: { type: "OBJECT", properties: { query: S("Name, company, phone or email as the person said it") }, required: ["query"] },
      },
      {
        name: "find_enquiries",
        description:
          "Search leads: website enquiries AND Anu's recorded customer calls. Filter by words (customer, company, phone, product), by status and by how recent. With no query it lists the most recent. Returns a total and up to 5 results.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: S("Optional words to match, for example 'Sharma' or 'acrylic trophy'"),
            status: { type: "STRING", format: "enum", enum: ["new", "contacted", "qualified", "quoted", "won", "lost"], description: "Optional status filter" },
            days: { type: "NUMBER", description: "Optional: only leads from the last N days" },
          },
        },
      },
      {
        name: "find_quotations",
        description:
          "Search quotations by number, customer, company, phone or item, optionally by status. With no query it lists the most recent. Returns a total, the total value and up to 5 results.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: S("Optional: quotation number, customer or item"),
            status: { type: "STRING", format: "enum", enum: ["draft", "sent", "accepted", "rejected", "expired", "invoiced"], description: "Optional status filter" },
          },
        },
      },
      {
        name: "get_quotation",
        description: "The full detail of one quotation: every line with quantity, rate and GST, the totals and validity. Use after find_quotations when they ask what is in it.",
        parameters: { type: "OBJECT", properties: { id: S("The quotation id from a previous result") }, required: ["id"] },
      },
      {
        name: "find_products",
        description:
          "Search the Ortex catalogue by name, category, material or SKU. Returns price excluding and including GST, GST rate, minimum order and dispatch days.",
        parameters: { type: "OBJECT", properties: { query: S("Product words, for example 'satin lanyard' or 'MDF keychain'") }, required: ["query"] },
      },
      {
        name: "sales_summary",
        description: "Quoted value, won value, win rate, website enquiries and Anu calls over the last N days. Use for 'how are we doing', 'this month's numbers'.",
        parameters: { type: "OBJECT", properties: { days: { type: "NUMBER", description: "Period length in days, for example 7, 30 or 90" } }, required: ["days"] },
      },
      {
        name: "set_enquiry_status",
        description:
          "Change the status of one enquiry or Anu call. Only after reading the change back and hearing a clear yes; send confirmed=true then. Without confirmation the reply asks you to confirm first.",
        parameters: {
          type: "OBJECT",
          properties: {
            id: S("The enquiry or voice_call id from a previous result"),
            kind: { type: "STRING", format: "enum", enum: ["enquiry", "voice_call"], description: "The kind given with that result" },
            status: { type: "STRING", format: "enum", enum: ["new", "contacted", "qualified", "quoted", "won", "lost"], description: "The new status" },
            confirmed: { type: "BOOLEAN", description: "true only after the person said yes to this exact change" },
          },
          required: ["id", "kind", "status", "confirmed"],
        },
      },
      {
        name: "start_quotation",
        description:
          "Open a NEW quotation draft in the console, pre-filled with a customer and items, for the person to review and save. Only after they confirmed the customer and items. The editor opens beside you and the conversation carries on.",
        parameters: {
          type: "OBJECT",
          properties: {
            customer_id: S("Optional: a customer id from find_customers"),
            customer_name: S("The customer's name or company, when there is no customer id"),
            items: {
              type: "ARRAY",
              description: "Each item with its quantity",
              items: {
                type: "OBJECT",
                properties: { product: S("Product as said, matched to the catalogue"), quantity: S("Quantity in digits") },
                required: ["product"],
              },
            },
            confirmed: { type: "BOOLEAN", description: "true only after the person agreed to the customer and items" },
          },
          required: ["items", "confirmed"],
        },
      },
      {
        name: "open_record",
        description: "Show a record in the console right now: a customer, enquiry, Anu call, quotation or product. It opens beside you and the conversation carries on.",
        parameters: {
          type: "OBJECT",
          properties: {
            kind: { type: "STRING", format: "enum", enum: ["customer", "enquiry", "voice_call", "quotation", "product"], description: "The kind given with the result" },
            id: S("The id from a previous result"),
          },
          required: ["kind", "id"],
        },
      },
      {
        name: "end_call",
        description: "Hang up after a short goodbye, when the person is done.",
      },
    ],
  },
]
