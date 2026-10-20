from fastapi import APIRouter
from app.domain.generation_gate import approve_current_project
from app.schemas.api import ApprovalResponse, ProjectRequest


router = APIRouter()


@router.post("/projects/approve", response_model=ApprovalResponse)
def approve_project_endpoint(req: ProjectRequest) -> ApprovalResponse:
    project_dict = req.project.model_dump(by_alias=True)
    res = approve_current_project(project_dict)
    
    return ApprovalResponse(
        diagnostics=res.get("diagnostics", []),
        reconciliation=res.get("reconciliation"),
        approval=res.get("approval"),
    )
