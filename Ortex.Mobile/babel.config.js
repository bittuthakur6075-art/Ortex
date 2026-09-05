module.exports = {
  presets: ["babel-preset-expo"],
  plugins: [
    // The `@/` -> ./src alias. tsconfig `paths` alone is not enough here: that
    // is resolved by Expo's Metro integration, and this is a BARE project whose
    // bundles are built by the React Native CLI's own Metro. Rewriting the
    // specifier at transform time works under either.
    [
      "module-resolver",
      {
        root: ["./src"],
        alias: { "@": "./src" },
        extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
      },
    ],
    // `import { SUPABASE_URL } from "@env"` — a Babel-time inline of .env, so
    // there is no native module to link and nothing to configure per platform.
    [
      "module:react-native-dotenv",
      {
        moduleName: "@env",
        path: ".env",
        safe: false,
        allowUndefined: true,
      },
    ],
  ],
}
