// Shared bits for the Users page and its row actions.

/** A readable throwaway password for a new account or a reset. */
export const randomPassword = () =>
  "Ox-" + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6).toUpperCase()
