from fastapi import APIRouter
from app.api.v1.routes import (
    approval,
    execution,
    flowcharts,
    generation,
    health,
    projects,
    reconciliation,
    specifications,
)


api_router = APIRouter()

api_router.include_router(health.router, tags=["Health"])
api_router.include_router(projects.router, tags=["Projects"])
api_router.include_router(specifications.router, tags=["Specifications"])
api_router.include_router(flowcharts.router, tags=["Flowcharts"])
api_router.include_router(reconciliation.router, tags=["Reconciliation"])
api_router.include_router(approval.router, tags=["Approval"])
api_router.include_router(generation.router, tags=["Generation"])
api_router.include_router(execution.router, tags=["Execution"])

