// Stand-ins for the console's browser-only modules, see loader.js. Anything
// that reaches one of these is a write path the bot must never take, so it
// throws rather than silently doing nothing.
const refuse = (what) => () => {
  throw new Error(`${what} is not available in the WhatsApp bot (read-only)`)
}

export const repo = new Proxy({}, { get: (_, key) => refuse(`repo.${String(key)}`) })
export const notifyInvoiceCreated = refuse("notifyInvoiceCreated")
