import { transformSync } from "@babel/core"
import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

// Load a source module in plain Node, for tests.
//
// Two things stop `import()` working directly on this project's files:
//   - Ortex.Mobile is TypeScript and uses an `@/` alias that Metro resolves
//     through tsconfig paths, which Node knows nothing about.
//   - Ortex.Admin is bundled by Vite, so its imports are extensionless
//     (`from "./format"`), which Node's ESM resolver rejects.
//
// So a module is transformed with Babel's TypeScript preset and every import
// specifier is rewritten to an absolute file URL with a real extension, then
// evaluated. That is enough to exercise the pure domain modules — pricing,
// format, id, voice — off-device and against their console originals.
//
// It works only for modules with no React Native imports, which is exactly the
// boundary `src/domain/` is meant to hold. If a domain file ever stops loading
// here, it has grown a UI dependency it should not have.

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src")

const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"]

/** Append the extension the bundler would have inferred. */
function withExtension(base) {
  if (existsSync(base) && /\.[a-z]+$/i.test(base)) return base
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext
  }
  for (const ext of EXTENSIONS) {
    const index = resolve(base, `index${ext}`)
    if (existsSync(index)) return index
  }
  return base
}

const cache = new Map()

/**
 * @param {string} target Either a path relative to `src/` ("domain/pricing.ts")
 *   or an absolute path to any source file in the repo.
 */
export async function loadModule(target) {
  const file = withExtension(isAbsolute(target) ? target : resolve(SRC, target))
  if (cache.has(file)) return cache.get(file)

  const source = readFileSync(file, "utf8")
  const { code } = transformSync(source, {
    filename: file,
    presets: [["@babel/preset-typescript", { onlyRemoveTypeImports: false }]],
    babelrc: false,
    configFile: false,
  })

  // Rewrite every specifier to an absolute file URL so the evaluated data: URL
  // module can reach its dependencies, whichever project they live in.
  const rewritten = code.replace(/(from\s*|import\s*\(\s*)(["'])([^"']+)\2/g, (match, prefix, quote, spec) => {
    let base
    if (spec.startsWith("@/")) base = resolve(SRC, spec.slice(2))
    else if (spec.startsWith(".")) base = resolve(dirname(file), spec)
    else return match // a real package — let Node resolve it normally
    return `${prefix}${quote}${pathToFileURL(withExtension(base)).href}${quote}`
  })

  const loaded = import(`data:text/javascript;base64,${Buffer.from(rewritten).toString("base64")}`)
  cache.set(file, loaded)
  return loaded
}

/** Convenience alias for the common case: a file under Ortex.Mobile/src. */
export const loadTs = loadModule
