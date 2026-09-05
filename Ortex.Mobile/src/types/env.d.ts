// Types for the `@env` module that react-native-dotenv synthesises at build
// time from .env. Values are always strings, and always possibly missing — the
// file is untracked, so a fresh clone has none until someone copies .env.example.
declare module "@env" {
  export const SUPABASE_URL: string | undefined
  export const SUPABASE_ANON_KEY: string | undefined
}
