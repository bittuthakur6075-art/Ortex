// GST state codes (first two digits of a GSTIN) → state / UT names, and the
// reverse lookup used when importing Tally vouchers that carry names.
export const GST_STATES = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman & Diu",
  "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (old)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
}

const ALIASES = {
  "jammu and kashmir": "01",
  "daman and diu": "25",
  "dadra and nagar haveli": "26",
  "dadra & nagar haveli": "26",
  "andaman and nicobar islands": "35",
  "andaman & nicobar": "35",
  "orissa": "21",
  "pondicherry": "34",
  "uttaranchal": "05",
  "new delhi": "07",
}

// "07" → "Delhi". Unknown or blank codes return the code itself (or "").
export function stateName(code) {
  const c = String(code || "").trim().padStart(2, "0")
  if (!c || c === "00") return ""
  return GST_STATES[c] || c
}

// "07" → "Delhi (07)"; used on documents where both are useful.
export function stateLabel(code) {
  const c = String(code || "").trim().padStart(2, "0")
  if (!c || c === "00") return ""
  const name = GST_STATES[c]
  return name ? `${name} (${c})` : c
}

// "Maharashtra" → "27". Accepts a bare 2-digit code too.
export function stateNameToCode(name) {
  if (!name) return ""
  const n = name.trim().toLowerCase()
  if (/^\d{2}$/.test(n)) return n
  if (ALIASES[n]) return ALIASES[n]
  for (const [code, label] of Object.entries(GST_STATES)) {
    if (label.toLowerCase() === n) return code
  }
  return ""
}
