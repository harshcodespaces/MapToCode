import type { ProjectEnvelope, GenerationApproval } from "./contracts";
import type { Diagnostic } from "./diagnostics";
import type { ReconciliationResult } from "./reconciliation";

export interface ApiHealthResponse {
  status: "ok" | "degraded";
  version: string;
  uptimeSeconds?: number;
  environment?: string;
}

export interface ApiValidationResponse {
  valid: boolean;
  sourceType: "specification" | "flowchart";
  diagnostics: Diagnostic[];
}

export interface ApiReconcileResponse {
  reconciliation: ReconciliationResult;
  diagnostics: Diagnostic[];
}

export interface ApiGenerateResponse {
  status: "ready" | "blocked";
  language: "c" | "python";
  code?: string;
  diagnostics: Diagnostic[];
}

export interface ApiApproveResponse {
  approved: boolean;
  approval?: GenerationApproval;
  diagnostics: Diagnostic[];
}

export interface ApiExecuteRequest {
  project: ProjectEnvelope;
  language: "c" | "python";
  stdin?: string;
}

export interface ApiExecuteResponse {
  success: boolean;
  status:
    | "completed"
    | "success"
    | "compilation_error"
    | "runtime_error"
    | "rate_limited"
    | "gate_blocked"
    | "service_error"
    | "invalid_request"
    | "server_error"
    | "timeout";
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  executionTimeMs?: number;
  message?: string;
  diagnostics?: Diagnostic[];
  retryAfterSeconds?: number;
  runner?: "local_isolated" | "cloud_sandbox";
}
