// Freezes the clock (Node's and the database's: PGlite reads Date.now) at a
// Monday in October 2026, so the scenarios' fixed September dates stay "last
// month" and their weekdays stay right whenever this runs. Time still moves
// forward from there, so durations and timeouts behave.
const FROZEN = Date.parse("2026-10-05T04:30:00Z") // 10:00 IST
const real = Date.now
const started = real()
Date.now = () => FROZEN + (real() - started)
