import { posix } from "node:path";

const IMPORT =
  /\b(?:from|import)\s*["']([^"']+)["']|\bimport\s*\(\s*(?:["']([^"']+)["']|(?=[^"'\s]))|\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

/** Every module specifier a TypeScript source imports, in source order. */
export function listImports(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return [...code.matchAll(IMPORT)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? "<non-literal>",
  );
}

/**
 * The specifiers `source` may not import: only node builtins, the passport
 * package itself and files that stay inside the package root are allowed.
 * `file` is the importing file's path relative to that root.
 */
export function forbiddenImports(
  source: string,
  file: string,
  builtins: Set<string>,
): string[] {
  return listImports(source).filter((spec) => {
    if (spec === "<non-literal>") return true;
    if (spec.startsWith("node:") || builtins.has(spec)) return false;
    if (spec === "@kora/passport") return false;
    if (spec.startsWith("."))
      return posix.join(posix.dirname(file), spec).startsWith("..");
    return true;
  });
}
