export type Severity = "Low" | "Medium" | "High" | "Critical";

export interface Evidence {
  kind: "check" | "custom_rule" | "policy" | "runtime";
  id: string;
  severity: Severity;
  message: string;
  facts?: Record<string, unknown>;
}

export interface DependencyAncestryPath {
  ancestors: string[];
}

export interface DependencyAncestry {
  paths: DependencyAncestryPath[];
}

export interface LockfilePackageResult {
  name: string;
  requested: string | null;
  allow: boolean;
  risk: Severity;
  reasons: string[];
  evidence: Evidence[];
  dependency_ancestry?: DependencyAncestry;
  /** Set by the action when merging multiple lockfile audits. */
  source?: string;
}

export interface DecisionFingerprints {
  config: string;
  policy: string;
}

export interface LockfileResponse {
  allow: boolean;
  risk: Severity;
  total: number;
  denied: number;
  packages: LockfilePackageResult[];
  fingerprints: DecisionFingerprints;
}
