// Module resolution hook, registered by register.js.
//
// 1. The console's source uses Vite-style extensionless relative imports
//    ("../format"), which Node's ESM resolver refuses. A relative specifier
//    that fails is retried with ".js" and then "/index.js".
// 2. `data/domain/domain.js` (which today.js needs for invoiceBalance and
//    resolveInvoiceStatus) also imports the browser data store and the email
//    notifier, which read Vite's import.meta.env and localStorage at load
//    time. Those two modules are swapped for stubs.js: the bot reads Supabase
//    itself and never calls a function that writes.

const STUBBED = [/\/src\/data\/store\/repository(\.js)?$/, /\/src\/services\/notify(\.js)?$/]
const STUB_URL = new URL("./stubs.js", import.meta.url).href

export async function resolve(specifier, context, next) {
  const isRelative = specifier.startsWith(".") || specifier.startsWith("/")
  if (isRelative && context.parentURL) {
    const target = new URL(specifier, context.parentURL).href
    if (STUBBED.some((re) => re.test(target))) return { url: STUB_URL, shortCircuit: true }
  }
  try {
    return await next(specifier, context)
  } catch (err) {
    if (!isRelative || err?.code !== "ERR_MODULE_NOT_FOUND") throw err
    for (const suffix of [".js", "/index.js"]) {
      try {
        return await next(specifier + suffix, context)
      } catch {
        /* try the next shape */
      }
    }
    throw err
  }
}
