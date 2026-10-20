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
  } else if (!/^\+?[\d\s-]{10,}$/.test(formData.phone)) {
    tempErrors.phone = "Please enter a valid phone number"
  }
  if (!formData.productInterest) {
    tempErrors.productInterest = "Please select a product category"
  }
  return tempErrors
}
