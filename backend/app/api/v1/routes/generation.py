from fastapi import APIRouter
from app.domain.generation_gate import generate_c_for_project, generate_python_for_project
from app.schemas.api import GenerateCodeResponse, ProjectRequest


router = APIRouter()


@router.post("/projects/generate/c", response_model=GenerateCodeResponse)
def generate_c_endpoint(req: ProjectRequest) -> GenerateCodeResponse:
    project_dict = req.project.model_dump(by_alias=True)
    res = generate_c_for_project(project_dict)
    
    return GenerateCodeResponse(
        status=res["status"],
        code=res.get("code", ""),
        sourceMap=res.get("sourceMap", []),
        diagnostics=res.get("diagnostics", []),
        reconciliation=res.get("reconciliation"),
    )


@router.post("/projects/generate/python", response_model=GenerateCodeResponse)
def generate_python_endpoint(req: ProjectRequest) -> GenerateCodeResponse:
    project_dict = req.project.model_dump(by_alias=True)
    res = generate_python_for_project(project_dict)
    
    return GenerateCodeResponse(
        status=res["status"],
        code=res.get("code", ""),
        sourceMap=res.get("sourceMap", []),
        diagnostics=res.get("diagnostics", []),
        reconciliation=res.get("reconciliation"),
    )
