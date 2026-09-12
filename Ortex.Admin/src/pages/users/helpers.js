// Shared bits for the Users page and its row actions.

// A readable throwaway password for a new account or a reset. Drawn from
// crypto.getRandomValues, not Math.random: this string is a real credential,
// it is emailed, and Math.random is a seeded PRNG that makes no promise of
// unpredictability. The alphabet leaves out the characters people misread when
// a password is dictated over the phone (0/O, 1/l/I).
const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

export const randomPassword = (length = 12) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = "Ox-"
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}
