// ---- Gemini Live tool declarations -----------------------------------------
// Anu calls capture_lead to save/update the lead and end_call to hang up.

export const LIVE_TOOLS = [{
  functionDeclarations: [
    {
      name: "capture_lead",
      description: "Save or UPDATE the customer's lead. Call this as soon as you have their name and a confirmed WhatsApp number, and again every single time any detail changes or is added (a new item, a corrected quantity, the timeline, the delivery city). ALWAYS send the complete current picture, never just the part that changed, because each call replaces the previous one. Call it silently, do not announce it. The details are validated: if the response is ok=false, the name or number was invalid, so confirm it with the customer and call this again.",
      parameters: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "Customer's name" },
          phone: { type: "STRING", description: "WhatsApp number, a 10-digit Indian mobile starting 6-9. Digits only if possible." },
          items: {
            type: "ARRAY",
            description: "EVERY product the customer wants, each with its own quantity. Send the full list on every call, including items agreed earlier. Use this whenever the order has more than one product.",
            items: {
              type: "OBJECT",
              properties: {
                product: { type: "STRING", description: "Product name, for example 'Customized diaries with individual names'" },
                quantity: { type: "STRING", description: "Quantity for this item, for example '1000'" },
                notes: { type: "STRING", description: "Anything specific to this item, such as colour, material or branding" },
              },
              required: ["product"],
            },
          },
          product: { type: "STRING", description: "Main product, for a single-item order. If the order has several items, use `items` instead." },
          quantity: { type: "STRING", description: "Approximate quantity for the main product" },
          timeline: { type: "STRING", description: "When they need it" },
          city: { type: "STRING", description: "Delivery city, if mentioned" },
          address: { type: "STRING", description: "Full delivery address, only if the customer volunteers it" },
          company: { type: "STRING", description: "Company or firm name, if they are buying for a business" },
          email: { type: "STRING", description: "Email address, only if the customer gives one" },
          summary: { type: "STRING", description: "One or two line summary of the requirement" },
        },
        required: ["name"],
      },
    },
    {
      name: "end_call",
      description: "Call this after you have said a warm goodbye and the conversation is complete, to end and close the call.",
    },
  ],
}]
