// Which backup files should a --keep N run delete?
//
// Pulled out of backup.mjs as a pure function for one reason: it is the only
// code in this repo that deletes data on a schedule, unattended, with nobody
// watching. An off-by-one here silently destroys backup history, and the moment
// you notice is the moment you needed it. So it is separated and tested.
//
// Contract: given the filenames in the backup directory and how many to keep,
// return the ones to delete, oldest first. Never returns more than
// files.length - keep entries, and returns nothing at all when keep is not a
// usable number, so a bad argument prunes nothing rather than everything.

const DUMP = /^ortex-.*\.json$/

export function selectStale(files, keep) {
  if (!Number.isInteger(keep) || keep < 1) return []

  // Only ever consider our own dumps. Anything else a user has put in this
  // folder -- notes, an export, the backup.log -- is not ours to delete.
  const dumps = files.filter((f) => DUMP.test(f)).sort()

  return dumps.slice(0, Math.max(0, dumps.length - keep))
}
