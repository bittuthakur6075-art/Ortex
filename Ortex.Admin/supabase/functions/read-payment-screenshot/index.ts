// Edge Function: read-payment-screenshot
//
// Extracts payment fields from a UPI, IMPS, NEFT, RTGS or bank transfer screenshot
// using Gemini Vision with structured JSON output. Used by both the mobile app
// and the web console.
//
// Callable only by active staff.

import { cors, json } from "../_shared/http.ts"
import { requireStaff } from "../_shared/auth.ts"
import { callerHasModule, withinUserQuota, QUOTA_MESSAGE } from "../_shared/guard.ts"
import { extractText, generateContent, logAiUsage } from "../_shared/gemini.ts"

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash"

interface RequestBody {
  image?: string
  company?: string
  defaultType?: "inflow" | "payout"
}

interface ExtractedPayment {
  isPaymentProof: boolean
  amount: number | null
  reference: string | null
  type: "inflow" | "payout"
  party: string | null
  method: string
  date: string | null
  status: "success" | "pending" | "failed" | "unknown"
  confidence: number
  warnings: string[]
}

const SYSTEM_INSTRUCTION = `You are an expert Indian accounting OCR assistant.
Analyze this payment receipt, UPI confirmation (PhonePe, Google Pay, Paytm, BHIM, CRED), bank transfer slip (NEFT, RTGS, IMPS), or cheque.
Extract transaction details with high precision.

Rules:
1. Amount: Return the transaction amount as a numeric float. Do not confuse the Indian Rupee symbol (₹) with digits (3, 7, 2, 8).
2. Reference: Extract the 12-digit UPI RRN / transaction reference, Bank UTR (e.g., SBINR..., HDFCN...), or IMPS reference number.
3. Direction / Type:
   - "inflow" if money was received, credited, or paid to the merchant/business.
   - "payout" if money was sent/transferred to an external party/vendor.
4. Party: Name of the counterparty (payer for inflow, payee for payout).
5. Method: Classify strictly as "UPI", "Bank transfer / NEFT", "RTGS", "Cheque", "Cash", "Card", or "Other".
6. Date: The transaction date in YYYY-MM-DD format (IST).
7. Status: "success", "pending", or "failed".
8. Confidence: Float between 0.0 and 1.0 representing extraction confidence.
9. isPaymentProof: true if this is a genuine payment screenshot/slip, false if unrelated photo.`

const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const staff = await requireStaff(req)
  if (staff instanceof Response) return staff
  if (!(await callerHasModule(req, "payments"))) return json({ error: "You need the payments module to read a receipt." }, 403)
  if (!(await withinUserQuota("payment-reader", staff.userId, 20, 100))) return json({ error: QUOTA_MESSAGE }, 429)

  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) return json({ error: "The receipt reader is not set up yet." }, 500)

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  const rawImage = typeof body.image === "string" ? body.image : ""
  if (!rawImage) return json({ error: "Add a screenshot of the payment first." }, 400)

  // Extract mime type and clean base64 data
  let mimeType = "image/jpeg"
  let base64Data = rawImage

  const match = rawImage.match(/^data:([^;]+);base64,(.+)$/s)
  if (match) {
    mimeType = match[1].toLowerCase()
    base64Data = match[2]
  }
  base64Data = base64Data.replace(/\s+/g, "")
  // A screenshot only: JPEG, PNG or WebP, at most 5 MB once decoded. Anything
  // else would be sent to Gemini at our cost, so it is refused here.
  if (!ALLOWED_TYPES.has(mimeType)) return json({ error: "Use a JPG, PNG or WebP screenshot." }, 415)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)) return json({ error: "That image could not be read." }, 400)
  if (Math.floor((base64Data.length * 3) / 4) > MAX_IMAGE_BYTES) {
    return json({ error: "That screenshot is too large. Use one under 5 MB." }, 413)
  }

  try {
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: "Extract the payment information from this receipt/screenshot according to the schema." },
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    }

    const res = await generateContent(MODEL, apiKey, payload)
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      console.error("Gemini API error in read-payment-screenshot:", res.status, errText.slice(0, 300))
      return json({ error: "Could not read the screenshot just now. Try again, or enter the payment by hand." }, 502)
    }

    const data = await res.json()
    const usage = data?.usageMetadata
    await logAiUsage("read-payment-screenshot", MODEL, usage)

    const rawText = extractText(data)
    let parsed: Partial<ExtractedPayment> = {}
    try {
      parsed = JSON.parse(rawText)
    } catch (e) {
      // The reply holds the payer's name, UPI ID and amount: log its length only.
      console.error("read-payment-screenshot: unparseable reply, length", rawText.length, e instanceof Error ? e.name : "")
      return json({ error: "Could not read the screenshot. Enter the payment by hand." }, 502)
    }

    const reading: ExtractedPayment = {
      isPaymentProof: parsed.isPaymentProof ?? true,
      amount: typeof parsed.amount === "number" && Number.isFinite(parsed.amount) ? parsed.amount : null,
      reference: parsed.reference ? String(parsed.reference).trim().replace(/\s+/g, "") : null,
      type: parsed.type === "payout" ? "payout" : "inflow",
      party: parsed.party ? String(parsed.party).trim() : null,
      method: parsed.method || (parsed.reference?.length === 12 ? "UPI" : "Bank transfer / NEFT"),
      date: parsed.date ? String(parsed.date).trim() : null,
      status: ["success", "pending", "failed"].includes(parsed.status as string)
        ? (parsed.status as "success" | "pending" | "failed")
        : "unknown",
      confidence: typeof parsed.confidence === "number" ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.9,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
    }

    return json({ reading })
  } catch (err) {
    console.error("Unexpected error in read-payment-screenshot:", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
