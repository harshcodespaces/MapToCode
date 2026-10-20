import type { AstProvenance } from "./ast";

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  field?: string;
  nodeId?: string;
  stepId?: string;
  provenance?: AstProvenance;
  details?: Record<string, any>;
}

export interface ValidationSummary {
  valid: boolean;
  diagnostics: Diagnostic[];
}
