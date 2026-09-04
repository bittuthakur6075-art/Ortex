import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { submitEnquiry } from "../../lib/leads"
import { whatsappLink } from "../../constants/site"
import { mapCategory, getFormErrors } from "./helpers"

/** Owns the contact form state: URL prefill, validation, submit and reset. */
export default function useContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    productInterest: "",
    message: "",
  })

  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [searchParams] = useSearchParams()

  useEffect(() => {
    const product = searchParams.get("product")
    const category = searchParams.get("category")

    if (product) {
      setFormData((prev) => ({
        ...prev,
        message: `Hi Ortex, I am interested in your portfolio item: "${product}". Please provide a customized quote for this product.`,
        productInterest: mapCategory(category) || prev.productInterest,
      }))
    }
  }, [searchParams])

  const validateForm = () => {
    const tempErrors = getFormErrors(formData)
    setErrors(tempErrors)
    return Object.keys(tempErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return
    setIsSubmitting(true)
    const res = await submitEnquiry({
      source: "Website contact form",
      customer: {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        company: formData.company,
      },
      productInterest: formData.productInterest,
      message: formData.message,
    })
    setIsSubmitting(false)

    if (res.queued) {
      toast.warning(
        `Saved as ${res.reference}. We could not reach our servers just now, so it will send automatically. WhatsApp us to be sure it lands.`,
        { duration: 10000, action: { label: "WhatsApp", onClick: () => window.open(whatsappLink(`Hi Ortex, my enquiry ${res.reference} may not have reached you. ${formData.message}`), "_blank", "noopener") } }
      )
    } else {
      toast.success(`Thanks, your enquiry is in. Reference ${res.reference}. We will be in touch within one working day.`)
    }
    setFormData({ name: "", email: "", phone: "", company: "", productInterest: "", message: "" })
    setErrors({})
  }

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }

  return { formData, errors, isSubmitting, handleChange, handleSubmit }
}
