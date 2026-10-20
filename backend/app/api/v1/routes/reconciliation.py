from fastapi import APIRouter
from app.domain.generation_gate import analyze_project
from app.schemas.api import ProjectAnalysisResponse, ProjectRequest


router = APIRouter()


@router.post("/projects/reconcile", response_model=ProjectAnalysisResponse)
def reconcile_project_endpoint(req: ProjectRequest) -> ProjectAnalysisResponse:
    project_dict = req.project.model_dump(by_alias=True)
    analysis = analyze_project(project_dict)
    
    recon = analysis.get("reconciliation")
    diagnostics = analysis.get("diagnostics", [])
    if recon:
        diagnostics = diagnostics + recon.get("diagnostics", [])

    return ProjectAnalysisResponse(
        diagnostics=diagnostics,
        reconciliation=recon,
    )
