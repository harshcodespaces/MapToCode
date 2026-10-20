from typing import Any
from fastapi import APIRouter, HTTPException
from app.schemas.api import CreateProjectRequest, ExportProjectRequest, ImportProjectRequest
from app.schemas.contracts import ProjectEnvelope
from app.services.project_service import create_project, export_project, import_project


router = APIRouter()


@router.post("/projects/create", response_model=ProjectEnvelope, response_model_exclude_none=True)
def post_create_project(req: CreateProjectRequest) -> Any:
    project_dict = create_project(req.name)
    return project_dict


@router.post("/projects/import", response_model=ProjectEnvelope, response_model_exclude_none=True)
def post_import_project(req: ImportProjectRequest) -> Any:
    try:
        imported = import_project(req.project)
        return imported
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/projects/export", response_model=ProjectEnvelope, response_model_exclude_none=True)
def post_export_project(req: ExportProjectRequest) -> Any:
    try:
        project_dict = req.project.model_dump(by_alias=True, exclude_none=True)
        return export_project(project_dict)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
