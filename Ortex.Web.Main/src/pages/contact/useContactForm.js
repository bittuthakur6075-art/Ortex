import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { submitEnquiry } from "../../lib/leads"
import { whatsappLink } from "../../constants/site"
import { ENQUIRY_CATEGORIES } from "../../constants/content"

const EMPTY = { name: "", email: "", phone: "", company: "", productInterest: "", message: "" }

// Field limits match the anonymous insert policy (Admin migration 0050), so an
// over-long field is caught here rather than rejected by the database.
const LIMITS = { name: 200, email: 254, phone: 40, company: 200, message: 8000 }

export function getFormErrors(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = "Please enter your name"
  if (!form.email.trim()) errors.email = "Please enter your email"
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Please enter a valid email address"
  const digits = form.phone.replace(/\D/g, "")
  if (!digits) errors.phone = "Please enter your phone number"
  else if (digits.length < 10 || digits.length > 15) errors.phone = "Please enter a valid phone number"
  if (!form.productInterest) errors.productInterest = "Please choose a product category"
  if (!form.message.trim()) errors.message = "Please tell us about your requirement"
  else if (form.message.trim().length < 10) errors.message = "Please add a little more detail (at least 10 characters)"
  for (const [field, max] of Object.entries(LIMITS)) {
    if (!errors[field] && form[field].length > max) errors[field] = `Please keep this under ${max} characters`
  }
  return errors
}

/** Owns the contact form: URL prefill, validation, submit and reset. */
export default function useContactForm() {
  const [formData, setFormData] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchParams] = useSearchParams()

  // ?interest=<category> from a product card, ?product=<title> from the portfolio.
  useEffect(() => {
    const interest = searchParams.get("interest")
    const product = searchParams.get("product")
    if (!interest && !product) return
    setFormData((prev) => ({
      ...prev,
      productInterest: ENQUIRY_CATEGORIES.includes(interest) ? interest : prev.productInterest,
      message: product ? `I saw "${product}" in your portfolio and would like a quote for something similar.` : prev.message,
    }))
  }, [searchParams])

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const found = getFormErrors(formData)
    setErrors(found)
    if (Object.keys(found).length) return

    setIsSubmitting(true)
    let res
    try {
      res = await submitEnquiry({
        customer: {
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          company: formData.company.trim(),
        },
        productInterest: formData.productInterest,
        message: formData.message.trim(),
      })
    } catch {
      toast.error("We could not send that. Please WhatsApp or call us and we will take it from there.")
      return
    } finally {
      // Always release the button, so a lead is never lost to a hung spinner.
      setIsSubmitting(false)
    }

    if (res.queued) {
      toast.warning(
        `Saved as ${res.reference}. We could not reach our server just now, so it will send automatically. WhatsApp us to be sure it lands.`,
        {
          duration: 12000,
          action: {
            label: "WhatsApp",
            onClick: () => window.open(whatsappLink(`Hi Ortex, my enquiry ${res.reference} may not have reached you. ${formData.message}`), "_blank", "noopener"),
          },
        }
      )
    } else {
      toast.success(`Thank you, your enquiry has reached us. Reference ${res.reference}. We will reply within one working day.`, { duration: 10000 })
    }
    setFormData(EMPTY)
    setErrors({})
  }

  return { formData, errors, isSubmitting, handleChange, handleSubmit }
}
