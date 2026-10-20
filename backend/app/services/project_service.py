import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from app.core.diagnostics import create_diagnostic


def create_project(name: Optional[str] = None) -> Dict[str, Any]:
    project_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    project_name = (name or "").strip() or "Untitled flowchart"

    return {
        "schemaVersion": "1.0.0",
        "projectId": project_id,
        "name": project_name,
        "specification": {
            "schemaVersion": "1.0.0",
            "revision": 1,
            "inputs": [],
            "outputs": [],
            "variables": [],
            "steps": [],
            "constraints": [],
            "examples": [],
        },
        "flowchart": {
            "schemaVersion": "1.0.0",
            "revision": 1,
            "nodes": [
                {"id": "start", "kind": "start", "payload": {}},
                {"id": "end", "kind": "end", "payload": {}},
            ],
            "edges": [
                {"id": "edge-start-end", "from": "start", "to": "end"},
            ],
            "layout": {
                "positions": {
                    "start": {"x": 370.0, "y": 40.0},
                    "end": {"x": 370.0, "y": 280.0},
                },
                "zoom": 1.0,
            },
        },
        "decisions": [],
        "revisions": {
            "semantic": 1,
            "presentation": 0,
        },
        "createdAt": now,
        "updatedAt": now,
    }


def validate_project_envelope(project: Dict[str, Any]) -> None:
    if not isinstance(project, dict):
        raise ValueError("Project must be a JSON object.")
    
    required = ["schemaVersion", "projectId", "name", "specification", "flowchart", "revisions"]
    for field in required:
        if field not in project:
            raise ValueError(f"Project missing required field: {field}")
            
    if project.get("schemaVersion") != "1.0.0":
        raise ValueError(f"Unsupported schemaVersion: {project.get('schemaVersion')}")
        
    try:
        uuid.UUID(str(project.get("projectId")))
    except Exception:
        raise ValueError(f"projectId must be a valid UUID: {project.get('projectId')}")


def import_project(data: Dict[str, Any]) -> Dict[str, Any]:
    imported = dict(data)
    if "generationApproval" in imported and imported["generationApproval"] is None:
        del imported["generationApproval"]
    validate_project_envelope(imported)
    now = datetime.now(timezone.utc).isoformat()
    imported["updatedAt"] = now
    return imported


def export_project(project: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = dict(project)
    if "generationApproval" in cleaned and cleaned["generationApproval"] is None:
        del cleaned["generationApproval"]
    validate_project_envelope(cleaned)
    return cleaned
