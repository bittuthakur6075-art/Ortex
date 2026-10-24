export const telHref = (num) => `tel:${num.replace(/[^+\d]/g, "")}`

export const productCategories = [
  "MDF products",
  "Acrylic products",
  "Lanyards & ID card accessories",
  "Badge manufacturing",
  "Examination boards",
  "Customized clipboards & writing pads",
  "Corporate gifting & promotional merchandise",
  "Customization & branding services",
  "Other",
]

/** Maps a portfolio category label from the URL to a form product category. */
export const mapCategory = (cat) => {
  if (!cat) return ""
  const lower = cat.toLowerCase()
  if (lower.includes("mdf")) return "MDF products"
  if (lower.includes("acrylic")) return "Acrylic products"
  if (lower.includes("lanyard") || lower.includes("id card")) return "Lanyards & ID card accessories"
  if (lower.includes("badge")) return "Badge manufacturing"
  if (lower.includes("gift")) return "Corporate gifting & promotional merchandise"
  if (lower.includes("stationery") || lower.includes("highlighter")) return "Corporate gifting & promotional merchandise"
  return "Other"
}

// The database refuses an anonymous enquiry past these lengths (Admin
// migration 0050), and a refused one cannot be sent later either, so the form
// stops typing at them. Company has no database cap; 200 keeps it sane.
export const LIMITS = { name: 200, email: 254, phone: 40, company: 200, message: 8000 }

/** Returns a field -> message map; an empty object means the form is valid. */
export const getFormErrors = (formData) => {
  const tempErrors = {}
  if (!formData.name.trim()) {
    tempErrors.name = "Name is required"
  }
  // Email and project details are optional: many buyers only leave a number,
  // and a shorter form brings in more of them. An email that is given must be valid.
  if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
    tempErrors.email = "Please enter a valid email address"
  }
  if (!formData.phone.trim()) {
    tempErrors.phone = "Phone number is required"
  } else {
    // Any of +, spaces, dashes and brackets around 10 to 15 digits, as in the
    // quote builder: "+91 98765 43210", "098765-43210", "(022) 2345 6789".
    const digits = formData.phone.replace(/\D/g, "")
    if (!/^\+?[\d\s\-()]+$/.test(formData.phone.trim()) || digits.length < 10 || digits.length > 15) {
      tempErrors.phone = "Please enter a valid phone number"
    }
  }
  for (const [field, max] of Object.entries(LIMITS)) {
    if ((formData[field] || "").length > max && !tempErrors[field]) {
      tempErrors[field] = `Please keep this under ${max.toLocaleString("en-IN")} characters`
    }
  }
  if (!formData.productInterest) {
    tempErrors.productInterest = "Please select a product category"
  }
  return tempErrors
}
