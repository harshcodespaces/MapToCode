from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.v1.router import api_router
from app.core.config import settings


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Stateless domain service for MapToCode AST normalization, static validation, reconciliation, and restricted code generation.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"message": str(exc), "code": "SERVICE_ERROR"},
    )


app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/")
def root_redirect():
    return {"message": "MapToCode API is running.", "docs": "/docs", "version": settings.VERSION}
