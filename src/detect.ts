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

const LOCKFILE_NAMES = new Set(Object.keys(LOCKFILE_REGISTRY_MAP));

export interface LockfileTarget {
  path: string;
  registry: string;
}

/**
 * Detect the registry from a path. If `p` is a file, match its basename.
 * If `p` is a directory, check for lockfiles in that directory only.
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

/**
 * Recursively discover all lockfiles under a directory.
 * Returns a list of lockfile paths with their detected registry.
 * Skips node_modules, .git, and other common non-project directories.
 */
export function discoverLockfiles(dir: string): LockfileTarget[] {
  const results: LockfileTarget[] = [];
  const skipDirs = new Set([
    "node_modules",
    ".git",
    "target",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
  ]);

  function walk(current: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          walk(path.join(current, entry.name));
        }
      } else if (entry.isFile() && LOCKFILE_NAMES.has(entry.name)) {
        const registry = LOCKFILE_REGISTRY_MAP[entry.name];
        results.push({ path: path.join(current, entry.name), registry });
      }
    }
  }

  walk(dir);
  return results;
}
