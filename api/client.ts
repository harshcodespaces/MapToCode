import { MapToCodeApiError } from "./errors";
import type {
  AlgorithmSpecification,
  Diagnostic,
  FlowchartGraph,
  GenerationApproval,
  ProjectEnvelope,
  ReconciliationResult,
  ValidationResult,
} from "../types/contracts";

export interface ApiHealthResponse {
  status: "ok" | "degraded";
  version: string;
}

export interface ProjectAnalysisResponse {
  diagnostics: Diagnostic[];
  reconciliation: ReconciliationResult | null;
}

export interface GenerateCodeResponse extends ProjectAnalysisResponse {
  status: "ready" | "blocked";
  code: string;
  sourceMap: Array<{ line: number; astNodeId: string; sourceRefs: unknown[] }>;
}

export type GenerateCResponse = GenerateCodeResponse;
export type GeneratePythonResponse = GenerateCodeResponse;

export interface ApprovalResponse extends ProjectAnalysisResponse {
  approval: GenerationApproval | null;
}

function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1").replace(/\/$/, "");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(payload: unknown, fallback: string): string {
  if (!isObject(payload)) return fallback;
  if (typeof payload.detail === "string") return payload.detail;
  if (typeof payload.message === "string") return payload.message;
  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (cause) {
    throw new MapToCodeApiError("MapToCode API is unavailable. Check that the local FastAPI service is running.", {
      details: cause,
    });
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new MapToCodeApiError(errorMessage(payload, `MapToCode API returned HTTP ${response.status}.`), {
      status: response.status,
      code: isObject(payload) && typeof payload.code === "string" ? payload.code : undefined,
      details: payload,
    });
  }
  if (isObject(payload) && (payload as Record<string, unknown>).generationApproval === null) {
    delete (payload as Record<string, unknown>).generationApproval;
  }
  return payload as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

/**
 * The only frontend HTTP boundary for the FastAPI service.
 *
 * The server re-runs every validation and generation-gate check; callers must
 * never treat client-side state as authority to generate final code.
 */
export interface ExplainFlowchartResponse {
  status: "ok" | "empty" | "incomplete";
  summary: string;
  narrativeSteps: Array<{
    stepNumber: number;
    nodeId: string;
    kind: string;
    title: string;
    description: string;
  }>;
  pseudocode: string;
  complexity: {
    time: string;
    space: string;
    explanation: string;
  };
  insights: string[];
}

export interface ExecutionResultResponse {
  success: boolean;
  status: "success" | "compilation_error" | "runtime_error" | "timeout" | "rate_limited" | "gate_blocked" | "service_error";
  message?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  executionTimeMs?: number;
  diagnostics?: Diagnostic[];
  retryAfterSeconds?: number;
  runner?: "local_isolated" | "cloud_sandbox";
}

export const mapToCodeApi = {
  health: (): Promise<ApiHealthResponse> => request<ApiHealthResponse>("/health"),
  createProject: (name?: string): Promise<ProjectEnvelope> => post<ProjectEnvelope>("/projects/create", { name }),
  importProject: (project: unknown): Promise<ProjectEnvelope> => post<ProjectEnvelope>("/projects/import", { project }),
  exportProject: (project: ProjectEnvelope): Promise<ProjectEnvelope> => post<ProjectEnvelope>("/projects/export", { project }),
  validateSpecification: (specification: AlgorithmSpecification): Promise<ValidationResult> =>
    post<ValidationResult>("/specifications/validate", { specification }),
  validateFlowchart: (flowchart: FlowchartGraph): Promise<ValidationResult> =>
    post<ValidationResult>("/flowcharts/validate", { flowchart }),
  explainFlowchart: (flowchart: FlowchartGraph): Promise<ExplainFlowchartResponse> =>
    post<ExplainFlowchartResponse>("/flowcharts/explain", { flowchart }),
  generateFlowchartCode: (flowchart: FlowchartGraph, language: "c" | "python" = "python"): Promise<GenerateCodeResponse> =>
    post<GenerateCodeResponse>("/flowcharts/generate", { flowchart, language }),
  reconcileProject: (project: ProjectEnvelope): Promise<ProjectAnalysisResponse> =>
    post<ProjectAnalysisResponse>("/projects/reconcile", { project }),
  approveProject: (project: ProjectEnvelope): Promise<ApprovalResponse> =>
    post<ApprovalResponse>("/projects/approve", { project }),
  generateC: (project: ProjectEnvelope): Promise<GenerateCResponse> =>
    post<GenerateCResponse>("/projects/generate/c", { project }),
  generatePython: (project: ProjectEnvelope): Promise<GeneratePythonResponse> =>
    post<GeneratePythonResponse>("/projects/generate/python", { project }),
  executeProject: (project: ProjectEnvelope, language: "c" | "python", stdin: string = ""): Promise<ExecutionResultResponse> =>
    post<ExecutionResultResponse>("/projects/execute", { project, language, stdin }),
};
