import * as fs from "node:fs";
import * as path from "node:path";

const LOCKFILE_REGISTRY_MAP: Record<string, string> = {
  "package-lock.json": "npm",
  "yarn.lock": "npm",
  "pnpm-lock.yaml": "npm",
  "Cargo.lock": "cargo",
  "requirements.txt": "pypi",
  "poetry.lock": "pypi",
  "uv.lock": "pypi",
  "Pipfile.lock": "pypi",
};

/**
 * Detect the registry from a path. If `p` is a file, match its basename.
 * If `p` is a directory, scan for known lockfiles.
 * Returns the registry key or null if nothing matched.
 */
export function detectRegistry(p: string): string | null {
  const stat = fs.statSync(p, { throwIfNoEntry: false });
  if (!stat) return null;

  if (stat.isFile()) {
    return LOCKFILE_REGISTRY_MAP[path.basename(p)] ?? null;
  }

  for (const [filename, registry] of Object.entries(LOCKFILE_REGISTRY_MAP)) {
    if (fs.existsSync(path.join(p, filename))) {
      return registry;
    }
  }

  return null;
}
