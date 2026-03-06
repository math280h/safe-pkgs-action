import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { detectRegistry, discoverLockfiles } from "../src/detect.js";

function withTempDir(fn: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-test-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
}

describe("detectRegistry", () => {
  it("returns null for non-existent path", () => {
    expect(detectRegistry("/does/not/exist/at-all")).toBeNull();
  });

  it("detects npm from package-lock.json file path", () => {
    withTempDir((dir) => {
      const file = path.join(dir, "package-lock.json");
      fs.writeFileSync(file, "{}");
      expect(detectRegistry(file)).toBe("npm");
    });
  });

  it("detects npm from yarn.lock file path", () => {
    withTempDir((dir) => {
      const file = path.join(dir, "yarn.lock");
      fs.writeFileSync(file, "");
      expect(detectRegistry(file)).toBe("npm");
    });
  });

  it("detects npm from pnpm-lock.yaml file path", () => {
    withTempDir((dir) => {
      const file = path.join(dir, "pnpm-lock.yaml");
      fs.writeFileSync(file, "");
      expect(detectRegistry(file)).toBe("npm");
    });
  });

  it("detects cargo from Cargo.lock file path", () => {
    withTempDir((dir) => {
      const file = path.join(dir, "Cargo.lock");
      fs.writeFileSync(file, "");
      expect(detectRegistry(file)).toBe("cargo");
    });
  });

  it("detects pypi from requirements.txt file path", () => {
    withTempDir((dir) => {
      const file = path.join(dir, "requirements.txt");
      fs.writeFileSync(file, "");
      expect(detectRegistry(file)).toBe("pypi");
    });
  });

  it("detects pypi from poetry.lock file path", () => {
    withTempDir((dir) => {
      const file = path.join(dir, "poetry.lock");
      fs.writeFileSync(file, "");
      expect(detectRegistry(file)).toBe("pypi");
    });
  });

  it("detects pypi from uv.lock file path", () => {
    withTempDir((dir) => {
      const file = path.join(dir, "uv.lock");
      fs.writeFileSync(file, "");
      expect(detectRegistry(file)).toBe("pypi");
    });
  });

  it("detects pypi from Pipfile.lock file path", () => {
    withTempDir((dir) => {
      const file = path.join(dir, "Pipfile.lock");
      fs.writeFileSync(file, "{}");
      expect(detectRegistry(file)).toBe("pypi");
    });
  });

  it("returns null for unknown file", () => {
    withTempDir((dir) => {
      const file = path.join(dir, "unknown.txt");
      fs.writeFileSync(file, "");
      expect(detectRegistry(file)).toBeNull();
    });
  });

  it("detects registry by scanning directory for lockfile", () => {
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, "Cargo.lock"), "");
      expect(detectRegistry(dir)).toBe("cargo");
    });
  });

  it("returns first matching lockfile in directory scan", () => {
    withTempDir((dir) => {
      // package-lock.json comes first in the map
      fs.writeFileSync(path.join(dir, "package-lock.json"), "{}");
      fs.writeFileSync(path.join(dir, "Cargo.lock"), "");
      expect(detectRegistry(dir)).toBe("npm");
    });
  });

  it("returns null for empty directory", () => {
    withTempDir((dir) => {
      expect(detectRegistry(dir)).toBeNull();
    });
  });
});

describe("discoverLockfiles", () => {
  it("finds lockfiles in root directory", () => {
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, "package-lock.json"), "{}");
      const results = discoverLockfiles(dir);
      expect(results).toHaveLength(1);
      expect(results[0].registry).toBe("npm");
    });
  });

  it("finds lockfiles in nested directories", () => {
    withTempDir((dir) => {
      fs.mkdirSync(path.join(dir, "apps", "frontend"), { recursive: true });
      fs.mkdirSync(path.join(dir, "apps", "backend"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "apps", "frontend", "package-lock.json"),
        "{}",
      );
      fs.writeFileSync(path.join(dir, "apps", "backend", "Cargo.lock"), "");
      const results = discoverLockfiles(dir);
      expect(results).toHaveLength(2);
      const registries = results.map((r) => r.registry).sort();
      expect(registries).toEqual(["cargo", "npm"]);
    });
  });

  it("skips node_modules", () => {
    withTempDir((dir) => {
      fs.mkdirSync(path.join(dir, "node_modules", "dep"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "node_modules", "dep", "package-lock.json"),
        "{}",
      );
      fs.writeFileSync(path.join(dir, "Cargo.lock"), "");
      const results = discoverLockfiles(dir);
      expect(results).toHaveLength(1);
      expect(results[0].registry).toBe("cargo");
    });
  });

  it("skips .git directory", () => {
    withTempDir((dir) => {
      fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".git", "package-lock.json"), "{}");
      const results = discoverLockfiles(dir);
      expect(results).toHaveLength(0);
    });
  });

  it("returns empty array for empty directory", () => {
    withTempDir((dir) => {
      expect(discoverLockfiles(dir)).toEqual([]);
    });
  });

  it("finds multiple lockfile types in same directory", () => {
    withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, "package-lock.json"), "{}");
      fs.writeFileSync(path.join(dir, "requirements.txt"), "");
      const results = discoverLockfiles(dir);
      expect(results).toHaveLength(2);
      const registries = results.map((r) => r.registry).sort();
      expect(registries).toEqual(["npm", "pypi"]);
    });
  });

  it("finds lockfiles deeply nested", () => {
    withTempDir((dir) => {
      const deep = path.join(dir, "a", "b", "c");
      fs.mkdirSync(deep, { recursive: true });
      fs.writeFileSync(path.join(deep, "Cargo.lock"), "");
      const results = discoverLockfiles(dir);
      expect(results).toHaveLength(1);
      expect(results[0].registry).toBe("cargo");
      expect(results[0].path).toBe(path.join(deep, "Cargo.lock"));
    });
  });
});
