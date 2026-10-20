from fastapi import APIRouter
from app.domain.adapters import adapt_specification_to_ast
from app.domain.ast_validation import validate_ast_semantics
from app.schemas.api import ValidateSpecificationRequest
from app.schemas.contracts import ValidationResult


router = APIRouter()


@router.post("/specifications/validate", response_model=ValidationResult)
def validate_specification_endpoint(req: ValidateSpecificationRequest) -> ValidationResult:
    spec_dict = req.specification.model_dump(by_alias=True)
    adapted = adapt_specification_to_ast(spec_dict)
    
    if not adapted["valid"] or not adapted["ast"]:
        return ValidationResult(valid=False, diagnostics=adapted["diagnostics"])
        
    validation = validate_ast_semantics(adapted["ast"])
    combined_diagnostics = adapted["diagnostics"] + validation["diagnostics"]
    return ValidationResult(valid=len(combined_diagnostics) == 0, diagnostics=combined_diagnostics)
