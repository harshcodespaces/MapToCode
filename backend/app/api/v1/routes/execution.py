from fastapi import APIRouter, HTTPException, Request, Response
from app.schemas.api import ExecuteProjectRequest
from app.services.execution_service import (
    check_rate_limit,
    execute_sandboxed_code,
    verify_execution_gate,
)

router = APIRouter()


@router.post("/projects/execute")
async def execute_project_endpoint(payload: ExecuteProjectRequest, request: Request, response: Response):
    client_ip = request.client.host if request.client else "127.0.0.1"
    rate = check_rate_limit(client_ip)
    if not rate["allowed"]:
        response.status_code = 429
        response.headers["Retry-After"] = str(rate["retry_after_seconds"])
        return {
            "success": False,
            "status": "rate_limited",
            "message": rate["message"],
            "retryAfterSeconds": rate["retry_after_seconds"],
        }

    proj_dict = payload.project.model_dump()
    gate_check = verify_execution_gate(proj_dict, payload.language)
    if not gate_check["allowed"]:
        return {
            "success": False,
            "status": "gate_blocked",
            "reason": gate_check.get("reason"),
            "message": gate_check.get("message"),
            "diagnostics": gate_check.get("diagnostics", []),
        }

    result = await execute_sandboxed_code(
        language=gate_check["language"],
        code=gate_check["code"],
        stdin=payload.stdin,
    )

    if result.get("status") == "service_error":
        response.status_code = 502

    return result
