// A small, fixed business day for the tests and for `npm run preview -- --sample`.
// Every date is relative to `now`, so the fixture never goes stale.
const HOUR = 3600000
const DAY = 24 * HOUR

export function sampleData(now = Date.now()) {
  const ago = (ms) => new Date(now - ms).toISOString()
  return {
    enquiries: [
      { id: "e1", source: "Quote calculator", status: "new", customer: { name: "Priya Sharma", phone: "9876543210" }, productInterest: "MDF trophy", createdAt: ago(3 * HOUR), updatedAt: ago(3 * HOUR), tracking: { userId: "usr_a" } },
      { id: "e2", source: "Website contact form", status: "contacted", customer: { name: "Rahul", company: "TechNova" }, productInterest: "Lanyards", createdAt: ago(5 * DAY), updatedAt: ago(4 * DAY) },
      { id: "v1", source: "Voice assistant (Anu)", status: "new", customer: { name: "Anil Kumar", phone: "9811122233" }, productInterest: "Acrylic keychains", message: "", createdAt: ago(2 * HOUR), updatedAt: ago(2 * HOUR) },
    ],
    quotations: [
      { id: "q1", number: "QT-0101", status: "sent", customer: { company: "Sharma Traders" }, issueDate: ago(10 * DAY), validUntil: new Date(now + 20 * DAY).toISOString(), createdAt: ago(10 * DAY), updatedAt: ago(10 * DAY), totals: { grandTotal: 125000 } },
      { id: "q2", number: "QT-0102", status: "accepted", customer: { company: "Bright Events" }, issueDate: ago(3 * DAY), createdAt: ago(3 * DAY), updatedAt: ago(5 * HOUR), totals: { grandTotal: 40000 } },
      { id: "q3", number: "QT-0103", status: "sent", customer: { company: "Mehta & Co" }, issueDate: ago(2 * HOUR), validUntil: new Date(now + 2 * DAY).toISOString(), createdAt: ago(2 * HOUR), updatedAt: ago(2 * HOUR), totals: { grandTotal: 18000 } },
    ],
    invoices: [
      { id: "i1", number: "INV-0012", status: "sent", customer: { company: "Acme Corp", phone: "9000000001" }, issueDate: ago(40 * DAY), dueDate: ago(12 * DAY), createdAt: ago(40 * DAY), updatedAt: ago(40 * DAY), totals: { grandTotal: 48000, taxable: 40678 } },
      { id: "i2", number: "INV-0013", status: "sent", customer: { company: "Bright Events" }, issueDate: ago(1 * DAY), dueDate: new Date(now + 14 * DAY).toISOString(), createdAt: ago(20 * HOUR), updatedAt: ago(20 * HOUR), totals: { grandTotal: 40000, taxable: 33898 } },
    ],
    payments: [
      { id: "p1", type: "inflow", amount: 20000, invoiceId: "i2", date: ago(2 * HOUR), createdAt: ago(2 * HOUR), updatedAt: ago(2 * HOUR), customer: { company: "Bright Events" } },
    ],
    customers: [
      { id: "c1", name: "Priya Sharma", company: "Sharma Traders", phone: "9876543210", email: "priya@example.com" },
    ],
    activities: [
      { id: "a1", userId: "usr_a", activityType: "Product page visit", timestamp: ago(4 * HOUR), device: "Mobile", operatingSystem: "Android", referrer: "https://www.google.com/", metadata: { productName: "MDF trophy" } },
      { id: "a2", userId: "usr_a", activityType: "Quote request", timestamp: ago(3 * HOUR), device: "Mobile", operatingSystem: "Android", metadata: {} },
      { id: "a3", userId: "usr_b", activityType: "Home page visit", timestamp: ago(5 * HOUR), device: "Desktop", operatingSystem: "Windows", metadata: {} },
      { id: "a4", userId: "usr_c", activityType: "Quote builder visit", timestamp: ago(6 * HOUR), device: "Mobile", operatingSystem: "iOS", metadata: {} },
      { id: "a5", userId: "usr_c", activityType: "Product search", timestamp: ago(6 * HOUR), device: "Mobile", operatingSystem: "iOS", metadata: { searchQuery: "Lanyard" } },
    ],
  }
}
