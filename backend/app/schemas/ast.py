from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.contracts import ScalarType, SourceReference


class AstProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    astNodeId: str
    origins: List[SourceReference]
    transformationRuleId: str
    adapterVersion: str = "1.0.0"


class AstSymbol(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    type: ScalarType


class AstNode(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    kind: str


class TypedAst(BaseModel):
    model_config = ConfigDict(extra="forbid")
    irVersion: str = "1.0.0"
    programId: str
    body: Dict[str, Any]
    symbols: List[AstSymbol] = Field(default_factory=list)
    provenance: List[AstProvenance] = Field(default_factory=list)
