// ---- Gemini Live tool declarations -----------------------------------------
// Anu calls capture_lead to save and update the lead, and end_call to hang up.
// Both are answered by useLiveSession with a `next` instruction built from
// validateLead (leads.js), which is how the page, not the model, decides what
// is still missing and whether the call may end yet.

export const LIVE_TOOLS = [{
  functionDeclarations: [
    {
      name: "lookup_product",
      description: "Look up what Ortex actually lists before you describe, recommend or take an order for anything. Returns the live catalogue entry (material, minimum quantity, dispatch days, description), other products in the same category, and the add-ons worth offering next to it. An empty `matches` means the item is not in the catalogue: that is a custom run to be captured, never a refusal. Call it silently, as often as you need.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "What the customer asked for, in a few words, for example 'satin lanyards', 'acrylic trophy' or 'steel bottle gift set'" },
        },
        required: ["query"],
      },
    },
    {
      name: "capture_lead",
      description: "Save or UPDATE the customer's details. Call it as soon as you have a real name and a WhatsApp number the customer has confirmed, and again every time any detail is added or changes. ALWAYS send the complete current picture, never only the part that changed, because each call replaces the previous one. Call it silently. The reply says whether it was saved, which details are still missing or need checking, and what to do next: follow its `next` instruction.",
      parameters: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "The customer's real name, at least a first name. Never 'sir', 'madam' or 'customer'." },
          phone: { type: "STRING", description: "WhatsApp number as 10 digits starting with 6, 7, 8 or 9. Digits only, without +91." },
          items: {
            type: "ARRAY",
            description: "EVERY product the customer wants, each with its own quantity, including accepted add-ons. Send the full list on every call, including items agreed earlier.",
            items: {
              type: "OBJECT",
              properties: {
                product: { type: "STRING", description: "Specific product, for example 'Satin lanyards with logo print' or 'Acrylic keychains, custom shape'" },
                quantity: { type: "STRING", description: "Quantity as digits only, for example '500'. Convert spoken numbers: 'paanch sau' is 500, 'do hazaar' is 2000. Leave empty if the customer has not said yet." },
                notes: { type: "STRING", description: "Colour, material, size or branding details for this item" },
                custom: { type: "BOOLEAN", description: "true when this item is not in the Ortex catalogue and the team must quote it as a custom run" },
              },
              required: ["product"],
            },
          },
          product: { type: "STRING", description: "Main product, only for a single-item order. If the order has several items, use `items` instead." },
          quantity: { type: "STRING", description: "Quantity for the main product, digits only" },
          timeline: { type: "STRING", description: "When they need it, as the customer said it, for example 'by 15 October' or 'within two weeks'" },
          city: { type: "STRING", description: "Delivery city or town. Required before the call ends." },
          use_case: { type: "STRING", description: "What the order is for, for example 'annual awards', 'employee ID cards' or 'Diwali client gifting'" },
          address: { type: "STRING", description: "Full delivery address, only if the customer volunteers it" },
          company: { type: "STRING", description: "Company or firm name, if they are buying for a business" },
          email: { type: "STRING", description: "Email address, only if the customer gives one" },
          summary: { type: "STRING", description: "One line on the requirement. Start with 'Support:' for order status, complaints, damage or cancellations." },
          confirmed: { type: "BOOLEAN", description: "true ONLY in the call made right after you read back every detail (name, number, each product with its quantity, timeline, city) and the customer said it is correct. Otherwise false." },
        },
        required: ["name", "phone"],
      },
    },
    {
      name: "end_call",
      description: "End the call after a warm goodbye. With reason 'completed' the reply may refuse and say which details to capture or confirm first: follow it, then try again.",
      parameters: {
        type: "OBJECT",
        properties: {
          reason: {
            type: "STRING",
            format: "enum",
            enum: ["completed", "customer_declined", "customer_busy", "support_request", "not_relevant"],
            description: "completed: all five details captured and confirmed. customer_declined: they chose not to share details. customer_busy: they had to leave. support_request: an existing-order issue routed to the team. not_relevant: the call was not about Ortex.",
          },
        },
        required: ["reason"],
      },
    },
  ],
}]
