// Lets this Node process import the Admin console's PURE analytics modules
// (Ortex.Admin/src/lib/analytics/today.js, pages/automation/visitors.js, …) so
// every figure the bot sends is computed by the same code the Dashboard runs,
// and the two can never disagree about a number.
//
// Loaded with `node --import ./src/register.js`. Two things Vite does for the
// console have to be done here instead (see loader.js).
import { register } from "node:module"

register("./loader.js", import.meta.url)
