from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.contracts import (
    AlgorithmSpecification,
    Diagnostic,
    FlowchartGraph,
    GenerationApproval,
    ProjectEnvelope,
    ReconciliationResult,
    ValidationResult,
)


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["ok", "degraded"] = "ok"
    version: str = "1.0.0"
    localExecution: Optional[Dict[str, Any]] = None


class CreateProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None


class ImportProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project: Dict[str, Any]


class ExportProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project: ProjectEnvelope


class ValidateSpecificationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    specification: AlgorithmSpecification


class ValidateFlowchartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    flowchart: FlowchartGraph


class ExplainFlowchartResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["ok", "empty", "incomplete"]
    summary: str
    narrativeSteps: List[Dict[str, Any]] = Field(default_factory=list)
    pseudocode: str
    complexity: Dict[str, Any]
    insights: List[str] = Field(default_factory=list)


class GenerateFlowchartCodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    flowchart: FlowchartGraph
    language: Literal["c", "python"] = "python"


class ProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project: ProjectEnvelope


class ProjectAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    diagnostics: List[Diagnostic] = Field(default_factory=list)
    reconciliation: Optional[ReconciliationResult] = None


class ApprovalResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    diagnostics: List[Diagnostic] = Field(default_factory=list)
    reconciliation: Optional[ReconciliationResult] = None
    approval: Optional[GenerationApproval] = None


class GenerateCodeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["ready", "blocked"]
    code: str = ""
    sourceMap: List[Dict[str, Any]] = Field(default_factory=list)
    diagnostics: List[Diagnostic] = Field(default_factory=list)
    reconciliation: Optional[ReconciliationResult] = None


class ExecuteProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project: ProjectEnvelope
    language: Literal["c", "python"] = "c"
    stdin: str = ""

