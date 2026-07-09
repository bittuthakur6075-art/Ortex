import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ---------------------------------------------------------------------------
// Smart message generator
// ---------------------------------------------------------------------------
function generateSmartMessage(
  eventType: string,
  customerName: string,
  productName: string,
  metadata: Record<string, unknown>,
): string {
  const greeting = customerName ? `Hi ${customerName}! 👋` : 'Hello! 👋'
  const footer = '\n\n— Ortex Team\n📞 +91-9211947188'

  switch (eventType) {
    case 'quote_requested':
      return (
        `${greeting}\n\n` +
        `🙏 Thank you for requesting a quote for *${productName || 'our product'}*!\n\n` +
        `Our team will prepare a custom quote tailored to your requirements within *24 hours*.\n\n` +
        `In the meantime, feel free to reach out if you have any questions.` +
        footer
      )

    case 'contact_form_submitted':
      return (
        `${greeting}\n\n` +
        `✅ Thank you for contacting *Ortex*!\n\n` +
        `We have received your message and our team will get back to you within *2–4 business hours*.\n\n` +
        `We appreciate your interest and look forward to connecting with you!` +
        footer
      )

    case 'product_visited':
      return (
        `${greeting}\n\n` +
        `👀 We noticed you checked out *${productName || 'one of our products'}*!\n\n` +
        `Can we help you with pricing, specifications, or availability? Our experts are ready to assist.\n\n` +
        `Just reply to this message and we'll get back to you right away. 😊` +
        footer
      )

    case 'search_performed': {
      const searchQuery =
        (metadata?.searchQuery as string) ||
        (metadata?.query as string) ||
        'your requirement'
      return (
        `${greeting}\n\n` +
        `🔍 Looking for *${searchQuery}*? We've got you covered!\n\n` +
        `Ortex offers a wide range of industrial products. Let us help you find exactly what you need.\n\n` +
        `Share more details and we'll send you matching options right away. 🚀` +
        footer
      )
    }

    case 'pdf_downloaded':
      return (
        `${greeting}\n\n` +
        `📄 Thank you for downloading our catalogue!\n\n` +
        `We hope you find everything you're looking for. If you have questions about any product, pricing, or availability, don't hesitate to ask.\n\n` +
        `We're here to help! 😊` +
        footer
      )

    case 'cart_added':
      return (
        `${greeting}\n\n` +
        `🛒 Great choice adding *${productName || 'the product'}* to your quote cart!\n\n` +
        `Our team can help you finalise the details, confirm stock, and prepare a competitive quote.\n\n` +
        `Ready to proceed? Just reply and we'll take it from here! ✅` +
        footer
      )

    default:
      return (
        `${greeting}\n\n` +
        `🙏 Thank you for your interest in *Ortex*!\n\n` +
        `We are glad you reached out. Our team will be in touch with you shortly.\n\n` +
        `We look forward to serving you!` +
        footer
      )
  }
}

// ---------------------------------------------------------------------------
// Placeholder filler
// ---------------------------------------------------------------------------
function fillPlaceholders(
  template: string,
  data: Record<string, string | undefined>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => data[key] ?? `{${key}}`)
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // ------------------------------------------------------------------
    // 1. Parse request body
    // ------------------------------------------------------------------
    const { eventType, userId, description, metadata } = await req.json() as {
      eventType: string
      userId?: string
      description?: string
      metadata?: Record<string, unknown>
    }

    if (!eventType) {
      return new Response(JSON.stringify({ error: 'eventType is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ------------------------------------------------------------------
    // 2. Initialise Supabase client
    // ------------------------------------------------------------------
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // ------------------------------------------------------------------
    // 3. Fetch all active automation rules
    // ------------------------------------------------------------------
    const { data: rulesRows, error: rulesError } = await supabase
      .from('automation_rules')
      .select('*')

    if (rulesError) {
      console.error('Error fetching automation_rules:', rulesError)
      return new Response(JSON.stringify({ error: 'Failed to fetch automation rules' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Filter in JS: active === true AND triggerEvent === eventType
    const matchingRules = (rulesRows ?? []).filter((row: { id: string; doc: Record<string, unknown> }) => {
      const doc = row.doc as Record<string, unknown>
      return doc.active === true && doc.triggerEvent === eventType
    })

    if (matchingRules.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: 'No matching active rules found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ------------------------------------------------------------------
    // 4. Fetch all message templates
    // ------------------------------------------------------------------
    const { data: templateRows, error: templateError } = await supabase
      .from('message_templates')
      .select('*')

    if (templateError) {
      console.error('Error fetching message_templates:', templateError)
      return new Response(JSON.stringify({ error: 'Failed to fetch message templates' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const templates = (templateRows ?? []) as Array<{ id: string; doc: Record<string, unknown> }>

    // ------------------------------------------------------------------
    // 5. Extract common context from metadata
    // ------------------------------------------------------------------
    const customer = (metadata?.customer as Record<string, string>) ?? {}
    const customerName: string = customer.name ?? ''
    const productName: string =
      (metadata?.product as Record<string, string>)?.name ??
      (metadata?.productName as string) ??
      ''
    const phone: string = customer.phone ?? ''
    const quantity: string = String(metadata?.quantity ?? '')
    const unit: string = String(metadata?.unit ?? '')
    const messageSnippet: string = (metadata?.messageSnippet as string) ?? description ?? ''

    const placeholderData: Record<string, string | undefined> = {
      name: customerName,
      product_name: productName,
      quantity,
      unit,
      message_snippet: messageSnippet,
      phone,
    }

    // ------------------------------------------------------------------
    // 6. Process each matching rule
    // ------------------------------------------------------------------
    let processedCount = 0

    for (const ruleRow of matchingRules) {
      const ruleDoc = ruleRow.doc as Record<string, unknown>

      // Resolve the rule's template. The console stores `templateId` as the
      // template's row id, but rules saved before that fix put the template
      // *name* there instead, so accept either — matching on id alone would
      // silently drop every legacy rule to the generic fallback message.
      const templateRef = (ruleDoc.templateId ?? ruleDoc.templateName) as string | undefined

      const matchedTemplate = templateRef
        ? templates.find((t) => t.id === templateRef) ??
          templates.find(
            (t) => (t.doc?.name as string)?.toLowerCase() === templateRef.toLowerCase(),
          )
        : undefined

      // Resolve message body
      let body: string

      if (matchedTemplate?.doc?.body) {
        body = fillPlaceholders(matchedTemplate.doc.body as string, placeholderData)
      } else {
        // Fallback: generate smart message
        body = generateSmartMessage(eventType, customerName, productName, metadata ?? {})
      }

      // ----------------------------------------------------------------
      // 6a. Save to ai_messages — field names match Automation.jsx
      // msg.triggerType, msg.context, msg.generatedMessage, msg.customerName
      // ----------------------------------------------------------------
      const ruleName = ruleDoc.name as string ?? 'Automation Rule'
      const context = `Trigger: ${ruleName}. Event: ${description ?? eventType}. Customer: ${customerName || 'Anonymous'}.`

      const aiMessageData = {
        triggerType: ruleName,
        context,
        generatedMessage: body,
        customerName,
        productName,
        phone: phone || null,
        userId: userId ?? null,
        eventType,
        ruleId: ruleRow.id,
        templateId: matchedTemplate?.id ?? null,
        createdAt: new Date().toISOString(),
      }

      const { error: aiMsgError } = await supabase
        .from('ai_messages')
        .insert({ doc: { ...aiMessageData } })

      if (aiMsgError) {
        console.error('Error inserting ai_message:', aiMsgError)
        continue
      }

      // ----------------------------------------------------------------
      // 6b. Save to whatsapp_logs — field names match Automation.jsx
      // log.messageText, log.templateName, log.phone, log.status='queued'
      // ----------------------------------------------------------------
      if (phone) {
        const cleanPhone = phone.replace(/\D/g, '')
        const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(body)}`
        // Only name the template that actually produced this body. Falling back
        // to the rule's templateRef here would stamp a template's name on a
        // generic fallback message it never generated.
        const resolvedTemplateName = (matchedTemplate?.doc?.name as string) ?? 'Auto Generated'

        const whatsappLogData = {
          customerName,
          phone,
          templateName: resolvedTemplateName,
          messageText: body,
          whatsappUrl,
          status: 'queued',
          retryCount: 0,
          maxRetries: 3,
          errorMessage: '',
          responsePayload: null,
          sentAt: null,
          userId: userId ?? null,
          eventType,
          ruleId: ruleRow.id,
          createdAt: new Date().toISOString(),
        }

        const { error: waError } = await supabase
          .from('whatsapp_logs')
          .insert({ doc: { ...whatsappLogData } })

        if (waError) {
          console.error('Error inserting whatsapp_log:', waError)
        }
      }

      processedCount++
    }

    // ------------------------------------------------------------------
    // 7. Return result
    // ------------------------------------------------------------------
    return new Response(
      JSON.stringify({
        processed: processedCount,
        totalMatchingRules: matchingRules.length,
        eventType,
        userId: userId ?? null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('Unexpected error in automation-engine:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
