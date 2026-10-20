import shutil
import sys
from fastapi import APIRouter
from app.schemas.api import HealthResponse
from app.core.config import settings


router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    has_gcc = bool(shutil.which("gcc") or shutil.which("clang"))
    c_compiler = "gcc" if shutil.which("gcc") else ("clang" if shutil.which("clang") else None)
    return HealthResponse(
        status="ok",
        version=settings.VERSION,
        localExecution={
            "python": True,
            "pythonVersion": sys.version.split()[0],
            "c": has_gcc,
            "cCompiler": c_compiler,
            "offlineSafe": True,
        },
    )
