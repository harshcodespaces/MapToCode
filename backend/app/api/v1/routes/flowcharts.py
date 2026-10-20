from fastapi import APIRouter
from app.domain.adapters import adapt_flowchart_to_ast
from app.domain.ast_validation import validate_ast_semantics
from app.domain.c_generator import generate_c_from_ast
from app.domain.flowchart_explanation import explain_flowchart_to_learner
from app.domain.python_generator import generate_python_from_ast
from app.schemas.api import (
    ExplainFlowchartResponse,
    GenerateCodeResponse,
    GenerateFlowchartCodeRequest,
    ValidateFlowchartRequest,
)
from app.schemas.contracts import ValidationResult


router = APIRouter()


@router.post("/flowcharts/validate", response_model=ValidationResult)
def validate_flowchart_endpoint(req: ValidateFlowchartRequest) -> ValidationResult:
    flow_dict = req.flowchart.model_dump(by_alias=True)
    adapted = adapt_flowchart_to_ast(flow_dict)

    if not adapted["valid"] or not adapted["ast"]:
        return ValidationResult(valid=False, diagnostics=adapted["diagnostics"])

    validation = validate_ast_semantics(adapted["ast"])
    combined_diagnostics = adapted["diagnostics"] + validation["diagnostics"]
    return ValidationResult(valid=len(combined_diagnostics) == 0, diagnostics=combined_diagnostics)


@router.post("/flowcharts/explain", response_model=ExplainFlowchartResponse)
def explain_flowchart_endpoint(req: ValidateFlowchartRequest) -> ExplainFlowchartResponse:
    flow_dict = req.flowchart.model_dump(by_alias=True)
    result = explain_flowchart_to_learner(flow_dict)
    return ExplainFlowchartResponse(
        status=result["status"],
        summary=result["summary"],
        narrativeSteps=result["narrativeSteps"],
        pseudocode=result["pseudocode"],
        complexity=result["complexity"],
        insights=result["insights"],
    )


@router.post("/flowcharts/generate", response_model=GenerateCodeResponse)
def generate_flowchart_code_endpoint(req: GenerateFlowchartCodeRequest) -> GenerateCodeResponse:
    flow_dict = req.flowchart.model_dump(by_alias=True)
    adapted = adapt_flowchart_to_ast(flow_dict)

    if not adapted["valid"] or not adapted["ast"]:
        return GenerateCodeResponse(
            status="blocked",
            code="",
            sourceMap=[],
            diagnostics=adapted["diagnostics"],
        )

    validation = validate_ast_semantics(adapted["ast"])
    if not validation["valid"]:
        return GenerateCodeResponse(
            status="blocked",
            code="",
            sourceMap=[],
            diagnostics=adapted["diagnostics"] + validation["diagnostics"],
        )

    generator = generate_python_from_ast if req.language == "python" else generate_c_from_ast
    gen_result = generator(adapted["ast"])

    return GenerateCodeResponse(
        status="ready" if not gen_result.get("diagnostics") else "blocked",
        code=gen_result.get("code", ""),
        sourceMap=gen_result.get("sourceMap", []),
        diagnostics=gen_result.get("diagnostics", []),
    )
