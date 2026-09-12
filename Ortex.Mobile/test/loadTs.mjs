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
const compiled = new Map()

const SPECIFIER = /(from\s*|import\s*\(\s*)(["'])([^"']+)\2/g

/** Where a specifier written inside `file` actually points, or null for a package. */
function resolveSpecifier(file, spec) {
  if (spec.startsWith("@/")) return withExtension(resolve(SRC, spec.slice(2)))
  if (spec.startsWith(".")) return withExtension(resolve(dirname(file), spec))
  return null // a real package — let Node resolve it normally
}

/**
 * Compile one file, and every file it imports, into data: URLs.
 *
 * The rewrite has to be RECURSIVE. Pointing a specifier at the dependency's own
 * `.ts` path works only one level deep: Node then loads that file itself, and
 * the `@/` aliases inside IT are specifiers Node has never heard of. That is
 * exactly what broke the moment a test reached a module two hops away
 * (notifications → quoteRfq → schema) and asked Node to resolve a package
 * called "@/domain".
 *
 * `inProgress` breaks an import cycle by falling back to the raw file path for
 * the back-edge — enough for the acyclic `src/domain/` these tests cover, and a
 * loud failure rather than a hang if that ever stops being true.
 */
function compileToDataUrl(file, inProgress = new Set()) {
  if (compiled.has(file)) return compiled.get(file)
  if (inProgress.has(file)) return pathToFileURL(file).href
  inProgress.add(file)

  const source = readFileSync(file, "utf8")
  const { code } = transformSync(source, {
    filename: file,
    presets: [["@babel/preset-typescript", { onlyRemoveTypeImports: false }]],
    babelrc: false,
    configFile: false,
  })

  const rewritten = code.replace(SPECIFIER, (match, prefix, quote, spec) => {
    const target = resolveSpecifier(file, spec)
    if (!target) return match
    return `${prefix}${quote}${compileToDataUrl(target, inProgress)}${quote}`
  })

  const url = `data:text/javascript;base64,${Buffer.from(rewritten).toString("base64")}`
  inProgress.delete(file)
  compiled.set(file, url)
  return url
}

/**
 * @param {string} target Either a path relative to `src/` ("domain/pricing.ts")
 *   or an absolute path to any source file in the repo.
 */
export async function loadModule(target) {
  const file = withExtension(isAbsolute(target) ? target : resolve(SRC, target))
  if (cache.has(file)) return cache.get(file)

  const loaded = import(compileToDataUrl(file))
  cache.set(file, loaded)
  return loaded
}

/** Convenience alias for the common case: a file under Ortex.Mobile/src. */
export const loadTs = loadModule
