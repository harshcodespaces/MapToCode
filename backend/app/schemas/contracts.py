from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


ScalarType = Literal["int", "double", "char"]
DiagnosticSeverity = Literal["error", "warning", "info"]
DiagnosticCategory = Literal["schema", "structure", "type", "semantics", "reconciliation", "generation"]
ReconciliationStatus = Literal["equivalent", "conflict", "unknown", "invalid"]
SourceKind = Literal["specification", "flowchart"]


class SourceReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sourceKind: SourceKind
    sourceObjectId: str
    sourceRevision: int


class Diagnostic(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str
    severity: DiagnosticSeverity = "error"
    category: str
    message: str
    sourceRefs: List[SourceReference] = Field(default_factory=list)
    suggestion: Optional[str] = None
    ruleVersion: str = "1.0.0"


class ValidationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    valid: bool
    diagnostics: List[Diagnostic] = Field(default_factory=list)


class ReconciliationFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    code: str
    severity: str = "error"
    difference: str
    specificationSourceRefs: List[SourceReference] = Field(default_factory=list)
    flowchartSourceRefs: List[SourceReference] = Field(default_factory=list)
    suggestion: Optional[str] = None


class ReconciliationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: ReconciliationStatus
    findings: List[ReconciliationFinding] = Field(default_factory=list)
    diagnostics: List[Diagnostic] = Field(default_factory=list)
    unresolvedCount: int = 0
    canonicalizerVersion: str = "1.0.0"
    revisions: Dict[str, Optional[int]] = Field(default_factory=dict)


class GenerationApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    projectId: str
    semanticRevision: int
    specificationRevision: int
    flowchartRevision: int
    canonicalAstFingerprint: str
    adapterVersion: str = "1.0.0"
    canonicalizerVersion: str = "1.0.0"
    validatorVersion: str = "1.0.0"
    generatorVersion: str = "1.0.0"
    approvedAt: str


class SpecificationDeclaration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    type: ScalarType
    description: Optional[str] = None


class SpecificationOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    description: str


class AlgorithmSpecification(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schemaVersion: str = "1.0.0"
    revision: int = 1
    inputs: List[SpecificationDeclaration] = Field(default_factory=list)
    outputs: List[SpecificationOutput] = Field(default_factory=list)
    variables: List[SpecificationDeclaration] = Field(default_factory=list)
    steps: List[Dict[str, Any]] = Field(default_factory=list)
    constraints: List[Any] = Field(default_factory=list)
    examples: List[Dict[str, Any]] = Field(default_factory=list)


class FlowchartNode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: str
    payload: Dict[str, Any] = Field(default_factory=dict)


class FlowchartEdge(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    id: str
    from_node: str = Field(alias="from")
    to_node: str = Field(alias="to")
    branch: Optional[Literal["true", "false"]] = None


class FlowchartLayout(BaseModel):
    model_config = ConfigDict(extra="forbid")
    positions: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    zoom: float = 1.0


class FlowchartGraph(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schemaVersion: str = "1.0.0"
    revision: int = 1
    nodes: List[FlowchartNode] = Field(default_factory=list)
    edges: List[FlowchartEdge] = Field(default_factory=list)
    layout: FlowchartLayout = Field(default_factory=FlowchartLayout)


class ProjectEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    schemaVersion: str = "1.0.0"
    projectId: str
    name: str
    specification: AlgorithmSpecification
    flowchart: FlowchartGraph
    decisions: List[Dict[str, Any]] = Field(default_factory=list)
    revisions: Dict[str, int] = Field(default_factory=lambda: {"semantic": 1, "presentation": 0})
    createdAt: str
    updatedAt: str
    generationApproval: Optional[GenerationApproval] = None
