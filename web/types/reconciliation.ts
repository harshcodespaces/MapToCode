import type { Diagnostic } from "./diagnostics";
import type { SourceReference } from "./contracts";

export type ReconciliationStatus = "equivalent" | "conflict" | "unknown" | "invalid";

export interface ReconciliationFinding {
  id: string;
  path: string;
  specificationValue?: unknown;
  flowchartValue?: unknown;
  specificationSourceRefs?: SourceReference[];
  flowchartSourceRefs?: SourceReference[];
  diagnostic?: Diagnostic;
}

export interface ReconciliationDiff {
  path: string;
  kind?: "mismatch" | "missing_in_spec" | "missing_in_flowchart" | "type_mismatch" | "condition_mismatch";
  message: string;
  specElementId?: string;
  flowchartElementId?: string;
}

export interface ReconciliationResult {
  status: ReconciliationStatus;
  reconciled?: boolean;
  findings?: ReconciliationFinding[];
  diffs?: ReconciliationDiff[];
  diagnostics?: Diagnostic[];
  unresolvedCount?: number;
  canonicalizerVersion?: string;
  revisions?: { specification: number | null; flowchart: number | null };
}
