import { describe, expect, it } from "bun:test";
import { meetsThreshold, mergeReports, renderSummary } from "../src/report.js";
import type { LockfileResponse, Severity } from "../src/types.js";

function makeReport(
  overrides: Partial<LockfileResponse> = {},
): LockfileResponse {
  return {
    allow: true,
    risk: "Low",
    total: 1,
    denied: 0,
    packages: [],
    fingerprints: { config: "abc", policy: "def" },
    ...overrides,
  };
}

describe("meetsThreshold", () => {
  it("returns false when failOn is 'off'", () => {
    expect(meetsThreshold("Critical", "off")).toBe(false);
  });

  it("returns false when failOn is unknown", () => {
    expect(meetsThreshold("Critical", "banana")).toBe(false);
  });

  it("returns true when risk equals threshold", () => {
    expect(meetsThreshold("High", "high")).toBe(true);
  });

  it("returns true when risk exceeds threshold", () => {
    expect(meetsThreshold("Critical", "high")).toBe(true);
  });

  it("returns false when risk is below threshold", () => {
    expect(meetsThreshold("Low", "high")).toBe(false);
    expect(meetsThreshold("Medium", "high")).toBe(false);
  });

  it("handles case-insensitive failOn", () => {
    expect(meetsThreshold("High", "HIGH")).toBe(true);
    expect(meetsThreshold("High", "High")).toBe(true);
    expect(meetsThreshold("High", "hIgH")).toBe(true);
  });

  it("works for all severity levels", () => {
    const levels: Severity[] = ["Low", "Medium", "High", "Critical"];
    for (const level of levels) {
      expect(meetsThreshold(level, level.toLowerCase())).toBe(true);
    }
  });

  it("Low threshold triggers on everything", () => {
    expect(meetsThreshold("Low", "low")).toBe(true);
    expect(meetsThreshold("Medium", "low")).toBe(true);
    expect(meetsThreshold("High", "low")).toBe(true);
    expect(meetsThreshold("Critical", "low")).toBe(true);
  });

  it("Critical threshold only triggers on Critical", () => {
    expect(meetsThreshold("Low", "critical")).toBe(false);
    expect(meetsThreshold("Medium", "critical")).toBe(false);
    expect(meetsThreshold("High", "critical")).toBe(false);
    expect(meetsThreshold("Critical", "critical")).toBe(true);
  });
});

describe("renderSummary", () => {
  it("renders passing report with checkmark", () => {
    const report = makeReport({ allow: true, risk: "Low", total: 5 });
    const md = renderSummary(report);
    expect(md).toContain("\u2705");
    expect(md).toContain("Pass");
    expect(md).toContain("Low");
    expect(md).toContain("5");
  });

  it("renders failing report with cross mark", () => {
    const report = makeReport({
      allow: false,
      risk: "High",
      total: 10,
      denied: 2,
    });
    const md = renderSummary(report);
    expect(md).toContain("\u274C");
    expect(md).toContain("Fail");
    expect(md).toContain("High");
    expect(md).toContain("10");
    expect(md).toContain("2");
  });

  it("includes denied packages table when there are denied packages", () => {
    const report = makeReport({
      allow: false,
      risk: "High",
      denied: 1,
      packages: [
        {
          name: "evil-pkg",
          requested: "1.0.0",
          allow: false,
          risk: "High",
          reasons: ["Known malware", "Typosquat"],
          evidence: [],
        },
      ],
    });
    const md = renderSummary(report);
    expect(md).toContain("Denied Packages");
    expect(md).toContain("evil-pkg");
    expect(md).toContain("1.0.0");
    expect(md).toContain("Known malware; Typosquat");
  });

  it("uses dash for missing version", () => {
    const report = makeReport({
      denied: 1,
      packages: [
        {
          name: "no-version",
          requested: null,
          allow: false,
          risk: "Medium",
          reasons: ["Suspicious"],
          evidence: [],
        },
      ],
    });
    const md = renderSummary(report);
    expect(md).toContain("no-version");
    expect(md).toContain("\u2014"); // em dash
  });

  it("omits denied packages section when all packages pass", () => {
    const report = makeReport({
      packages: [
        {
          name: "good-pkg",
          requested: "2.0.0",
          allow: true,
          risk: "Low",
          reasons: [],
          evidence: [],
        },
      ],
    });
    const md = renderSummary(report);
    expect(md).not.toContain("Denied Packages");
  });

  it("renders valid markdown table structure", () => {
    const report = makeReport();
    const md = renderSummary(report);
    expect(md).toContain("| Metric | Value |");
    expect(md).toContain("|--------|-------|");
  });
});

describe("mergeReports", () => {
  it("merges totals and denied counts", () => {
    const merged = mergeReports([
      {
        source: "a/package-lock.json",
        report: makeReport({ total: 3, denied: 1 }),
      },
      { source: "b/Cargo.lock", report: makeReport({ total: 5, denied: 2 }) },
    ]);
    expect(merged.total).toBe(8);
    expect(merged.denied).toBe(3);
  });

  it("takes the highest risk", () => {
    const merged = mergeReports([
      { source: "a", report: makeReport({ risk: "Low" }) },
      { source: "b", report: makeReport({ risk: "High" }) },
      { source: "c", report: makeReport({ risk: "Medium" }) },
    ]);
    expect(merged.risk).toBe("High");
  });

  it("sets allow to false if any report denies", () => {
    const merged = mergeReports([
      { source: "a", report: makeReport({ allow: true }) },
      { source: "b", report: makeReport({ allow: false }) },
    ]);
    expect(merged.allow).toBe(false);
  });

  it("keeps allow true when all reports allow", () => {
    const merged = mergeReports([
      { source: "a", report: makeReport({ allow: true }) },
      { source: "b", report: makeReport({ allow: true }) },
    ]);
    expect(merged.allow).toBe(true);
  });

  it("concatenates packages and tags with source", () => {
    const merged = mergeReports([
      {
        source: "frontend/package-lock.json",
        report: makeReport({
          packages: [
            {
              name: "a",
              requested: "1.0.0",
              allow: true,
              risk: "Low",
              reasons: [],
              evidence: [],
            },
          ],
        }),
      },
      {
        source: "backend/Cargo.lock",
        report: makeReport({
          packages: [
            {
              name: "b",
              requested: "2.0.0",
              allow: false,
              risk: "High",
              reasons: ["bad"],
              evidence: [],
            },
            {
              name: "c",
              requested: "3.0.0",
              allow: true,
              risk: "Low",
              reasons: [],
              evidence: [],
            },
          ],
        }),
      },
    ]);
    expect(merged.packages).toHaveLength(3);
    expect(merged.packages.map((p) => p.name)).toEqual(["a", "b", "c"]);
    expect(merged.packages[0].source).toBe("frontend/package-lock.json");
    expect(merged.packages[1].source).toBe("backend/Cargo.lock");
    expect(merged.packages[2].source).toBe("backend/Cargo.lock");
  });
});
